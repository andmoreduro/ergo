# Sequence Diagrams

This document describes chronological flows through Érgo's architecture. The primary path uses backend-owned Typst source materialization: React updates its local AST mirror, sends typed document events to Rust, Rust `DocumentSession` applies those events to its canonical AST, the retained-source VFS feeds Typst, and the frontend loads generated SVG page files.

## 1. Real-Time Editing And Preview Compilation

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant UI as React UI
    participant Commands as Action Registry / Form Handlers
    participant State as Document State
    participant API as Tauri API Client
    participant Session as Rust DocumentSession
    participant VFS as VirtualFileSystem
    participant Watch as TypstWatch
    participant Sync as PreviewSyncState
    participant World as ErgoWorld
    participant Typst as Typst Engine
    participant Preview as Preview Renderer
    participant Sidebar as Workspace Sidebar

    User->>UI: Types, edits, clicks, or triggers shortcut
    UI->>Commands: Dispatch action ID or typed form event
    Commands->>State: Apply typed document action
    State-->>UI: Immediate local UI update

    State->>State: Record forward/inverse DocumentEvent
    State->>Worker: sync_document_events(batch) on WASM DocumentSession
    Worker->>Worker: Regenerate Typst sources into worker VFS
    Worker->>Worker: compile_preview() via ergo-core preview_pipeline
    Worker->>Worker: store_preview in PreviewSyncState
    Worker-->>Preview: CompilationResult with canvas page list + outline/resources
    State->>API: sync_document_events mirror for backend archive/resource path
    API->>Session: Apply typed DocumentEvents on backend DocumentSession
    API->>API: emit_resources when snapshot or dirty resource IDs require it
    API->>Watch: mark_resources_pending()
    Watch->>Typst: compile resource-preview document only
    Watch->>VFS: write .ergproj/resource-previews/svg/*.svg
    Watch-->>API: emit updated resource catalog
    Preview->>Worker: render_page(page index) to Canvas pixels
    Preview-->>Sidebar: Publish compiled outline, resources, and displayed revision
    Preview-->>User: Updated live preview
```

### Flow Notes

- The frontend does not own canonical full Typst source generation.
- `sync_document_snapshot(ast)` is a cold-path bootstrap for new/opened documents. Normal edits, undo, and redo use `sync_document_event(event)`.
- `patch_source` remains a lower-level VFS command for focused source edits, but normal document editing syncs typed events to `DocumentSession`.
- Main preview compiles in the WASM worker. Backend `TypstWatch` compiles resource-preview SVGs only.
- Preview page pixels are rendered on demand in the frontend Canvas; backend main-preview SVG artifacts are not used.
- Frontend Typst generation utilities must not be used in the compile path. Backend `DocumentSession` is the only canonical source generator.
- The Tauri API client uses generated `ts-rs` bindings for all IPC DTOs. Hand-written frontend DTO shadows are not part of the flow.
- The retained preview document is runtime state only. It contains the compiled `PagedDocument`, source-map snapshot, Typst source snapshot, and page metrics. It is kept for sync and discarded/replaced when a newer non-stale preview compile succeeds.
- Preview page SVG writes are page-granular. The backend artifact pipeline renders each Typst page through `typst-svg`, compares rendered SVG text with the VFS file bytes, writes only changed pages as generated file artifacts, and marks each `PreviewPageFile.changed` value. The frontend SVG loader keeps unchanged page SVG strings in memory and reloads only changed pages.
- After a successful preview compile, a `DocumentOutline` is extracted from `document.introspector` and attached to the `CompilationResult` emitted by the `COMPILE_SUCCEEDED` event. The preview hook stores the latest outline and the workspace sidebar renders it with heading text and compiled page numbers. Sidebar outline rows map to editor fields and ignore repeated compiled entries that would target the same field. Failed preview results carry `outline: null`.
- `DocumentResources` is emitted through `ergo-resources-updated` from document sync handlers. The backend derives imported-file, figure, table, equation, and custom resource rows from the canonical AST, compiles the resource preview document on the sync path when required, writes `.ergproj/resource-previews/svg/*`, and records per-resource preview failures without failing the main preview compile.

Undo and redo use the same event pipe:

```mermaid
sequenceDiagram
    autonumber

    participant UI as React UI
    participant State as Document State
    participant API as Tauri API Client
    participant Session as DocumentSession

    UI->>State: Dispatch edit ASTAction
    State->>State: Compute next AST
    State->>State: Store {forwardEvent, inverseEvent, previousAst, nextAst}
    State->>API: sync_document_event(forwardEvent)
    API->>Session: Apply forward event

    UI->>State: Undo
    State->>State: Restore previousAst locally
    State->>API: sync_document_event(inverseEvent)
    API->>Session: Apply inverse event

    UI->>State: Redo
    State->>State: Restore nextAst locally
    State->>API: sync_document_event(forwardEvent)
    API->>Session: Apply forward event
```

Destructive inverse events carry the removed payload and exact position. Examples include `RestoreElement { section_id, index, element }`, `RestoreTableRow { table_id, row_index, cells }`, `RestoreTableColumn { table_id, col_index, cells, size }`, and `RestoreAuthor { section_id, author_index, author }`.

## 2. Archive Save

New project creation starts with frontend setup before the first archive save:

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant UI as React UI
    participant Path as System Path API
    participant Dialog as Project Setup Dialog
    participant OS as Native Folder Dialog
    participant API as Tauri API Client
    participant Archive as Archive Manager

    User->>UI: New Project command
    UI->>Path: documentDir()
    Path-->>UI: Default Documents path
    UI->>Dialog: Show project name, location, file name, default-name checkbox
    Dialog->>Dialog: While checked, generate lowercase snake_case file name from project name
    User->>Dialog: Optionally uncheck default file name and edit file name
    User->>Dialog: Optionally click folder button
    Dialog->>OS: Select destination folder
    OS-->>Dialog: Updated folder path or cancellation
    User->>Dialog: Create Project
    Dialog->>API: sync_document_snapshot(initial ast)
    API->>Session: Bootstrap canonical backend AST
    Session->>VFS: write canonical project files
    Dialog->>API: save_project(folder/file_name.ergproj)
    API->>Archive: Write first canonical archive from backend session
    API-->>UI: Load active project and remember path
```

The generated project file name preserves accents and other non-ASCII letters, removes Windows-invalid filename characters, converts whitespace to `_`, lowercases the result, and appends `.ergproj` when missing. Manual file-name overrides still remove Windows-invalid filename characters and append `.ergproj`, but otherwise preserve the user's spelling.

```mermaid
sequenceDiagram
    autonumber

    participant UI as React UI
    participant SyncLoop as Document Event Sync Loop
    participant API as Tauri API Client
    participant Session as DocumentSession
    participant VFS as VirtualFileSystem
    participant Archive as Archive Manager
    participant Disk as Host Disk

    UI->>SyncLoop: wait for queued document events to drain
    SyncLoop-->>UI: backend session caught up
    UI->>API: save_project(path)
    API->>Archive: pack mounted VFS files from current backend session
    Archive->>VFS: get_all_files()
    VFS-->>Archive: file map
    Archive->>Disk: write .ergproj zip
    Disk-->>Archive: write complete
    Archive-->>API: save successful
    API-->>UI: mark saved
```

### Archive Source Of Truth

The canonical archive state is:

- `main.typ`
- `elements/{element-id}.typ`
- `assets/`: imported resource file bytes referenced by `AssetEntry` metadata.
- `references.bib`: materialized from form-managed `ReferenceEntry` values.
- `.ergproj/document_state.json`
- `.ergproj/dependency_manifest.json`
- `.ergproj/project_settings.json`
- `.ergproj/template.json`
- `.ergproj/source_map.json`

Generated preview, export, and resource-preview files may exist in the VFS, but they should be treated as cache artifacts and can be regenerated. `.ergproj/resource-previews/` is excluded from archive saves.

## 3. Archive Open

```mermaid
sequenceDiagram
    autonumber

    participant UI as React UI
    participant API as Tauri API Client
    participant Archive as Archive Manager
    participant VFS as VirtualFileSystem
    participant Session as DocumentSession
    participant Disk as Host Disk

    UI->>API: open_project(path)
    API->>Archive: unzip .ergproj
    Archive->>Disk: read archive bytes
    Archive->>VFS: clear and mount text/binary files
    Archive->>VFS: read .ergproj/document_state.json
    VFS-->>Archive: AST JSON
    Archive-->>API: DocumentAST

    API->>Session: sync_snapshot(ast)
    Session->>VFS: regenerate missing/outdated main.typ and elements/*.typ
    Session-->>API: DocumentSessionStatus
    API-->>UI: load AST into frontend state
```

### Open Rule

`.ergproj/document_state.json` is required. The backend mounts archive files into the VFS, reads the structured document state, and materializes `main.typ`, element files, source maps, and metadata from that document state.

## 4. Autosave And Close Events

```mermaid
sequenceDiagram
    autonumber

    participant Settings as Global Settings
    participant UI as React UI
    participant State as Document State
    participant Autosave as Autosave Scheduler
    participant API as Tauri API Client
    participant Archive as Archive Manager
    participant Window as Tauri Window

    Settings-->>Autosave: interval and event toggles
    State-->>Autosave: dirty state and current project path

    alt periodic autosave enabled
        Autosave->>Autosave: wait autosave_interval_ms
        Autosave->>API: save_project(current path) when dirty
        API->>Archive: write .ergproj archive
        Archive-->>State: save complete / mark saved
    end

    alt save on window blur enabled
        Window-->>Autosave: app window loses focus
        Autosave->>API: save_project(current path) when dirty
    end

    alt save on project close enabled
        UI->>Autosave: close current project / open another project / create another project
        Autosave->>API: save_project(current path) when dirty
        API-->>UI: continue project boundary after save succeeds
    end

    alt save on app close enabled
        Window-->>Autosave: close requested
        Autosave->>Window: prevent close while dirty save runs
        Autosave->>API: save_project(current path)
        API-->>Autosave: save complete
        Autosave->>Window: close window
    end
```

## 5. Export

```mermaid
sequenceDiagram
    autonumber

    participant UI as React UI
    participant API as Tauri API Client
    participant VFS as VirtualFileSystem
    participant World as ErgoWorld
    participant Typst as Typst Engine

    UI->>API: export_document(format)
    API->>Typst: compile with ErgoWorld on command thread
    Typst->>World: request sources/files
    World->>VFS: read retained sources/assets
    VFS-->>World: Source/Bytes
    Typst-->>API: rendered document
    API->>VFS: write .ergproj/exports/*
    API-->>UI: CompilationResult succeeded or failed
```

Export runs synchronously on the Tauri command thread. It does not pass through `TypstWatch`.

## 6. Keymap Resolution

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant UI as React UI
    participant Runtime as ActionRuntimeProvider
    participant API as Tauri API Client
    participant Resolver as Rust Keymap Resolver
    participant Handlers as Focused Handler Chain

    User->>UI: Presses keyboard shortcut
    UI->>Runtime: Build LogicalKeyEvent from KeyboardEvent.key
    Runtime->>Runtime: Snapshot focused context node and ancestors
    Runtime->>API: resolve_key_event(event, context_snapshot)
    API->>Resolver: Load effective keymap and pending sequence state
    Resolver->>Resolver: Match logical sequence against context expressions
    Resolver-->>API: NoMatch / PendingSequence / Matched / Cancelled
    API-->>Runtime: ActionResolution
    Runtime->>Runtime: Prevent native defaults for command-like modified keys outside inputs
    Runtime->>Handlers: Dispatch ActionInvocation from focused context upward
    Handlers-->>UI: First matching handler performs action
```

Mouse surfaces use the same registry path:

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant Surface as Button/Menu/Toolbar Surface
    participant Runtime as ActionRuntimeProvider
    participant Handlers as Focused Handler Chain

    User->>Surface: Clicks a command surface
    Surface->>Runtime: dispatchAction(ActionInvocation)
    Runtime->>Handlers: Start at focused/local context and walk parents
    Handlers-->>Surface: Action handled or disabled
```

Every mouse-performable command-like operation should have a matching action. Action IDs use namespace-style names such as `workspace::OpenProject`; the namespace describes ownership, while the action context expression decides where the shortcut is valid. Raw typing inside form fields remains native input and document events, not actions.

Keymap settings are loaded from and saved to the app config file `keymap.json`, separate from general app settings in `settings.json`. The user config folder is named `Ergo`; bundled defaults live under the installed app resources as `defaults/default_keymap.json` and `defaults/default_settings.json`. The bundled keymap file owns default action bindings, while the user file persists profile selection and overrides. The keymap settings UI edits those overrides directly, so JSON customization and UI customization use the same strict schema.

There is no frontend fallback shortcut resolver. Keyboard events are normalized in React only to form `LogicalKeyEvent`; matching, pending-sequence state, fallback timeout decisions, and context-expression evaluation belong to Rust.

## 7. Preview And Editor Sync

Backward sync uses Typst's compiled frame tree rather than SVG attributes:

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant Preview as React SVG Preview
    participant API as Tauri API Client
    participant Sync as PreviewSyncState
    participant World as SnapshotWorld / IdeWorld
    participant TypstIDE as typst-ide jump APIs
    participant Session as DocumentSession
    participant Runtime as Action Runtime
    participant Editor as Form Editor

    User->>Preview: Clicks visible SVG page
    Preview->>Preview: Convert DOM click through SVG viewBox to x/y points
    Preview->>API: jump_from_preview_click(page, x_pt, y_pt, displayed_revision)
    API->>Sync: Resolve click if displayed revision matches retained preview
    Sync->>TypstIDE: jump_from_click(IdeWorld, PagedDocument, page.frame, point)
    TypstIDE->>World: Resolve source spans
    World-->>TypstIDE: Retained preview Source
    TypstIDE-->>Sync: Jump::File(file_id, offset)
    Sync->>Sync: Map file offset to FieldSourceMapEntry, fallback SourceMapEntry
    Sync-->>API: PreviewFocusTarget or element fallback / no match
    API-->>Preview: PreviewJumpResult
    Preview->>Runtime: dispatch editor::FocusField(target)
    Runtime->>Editor: update DocumentFocusState
    Editor->>Editor: registered field applies focus and caret in layout effect
```

Forward sync starts from the form editor's focused field:

```mermaid
sequenceDiagram
    autonumber

    participant Editor as Form Editor
    participant Preview as React SVG Preview
    participant API as Tauri API Client
    participant Sync as PreviewSyncState
    participant VFS as VirtualFileSystem
    participant TypstIDE as typst-ide jump APIs

    Editor->>Preview: DocumentFocusState changes
    Preview->>API: get_preview_positions_for_focus(target, displayed_revision)
    API->>Sync: Resolve field or element if displayed revision matches retained preview
    Sync->>Sync: Read retained section Source from preview snapshot
    Sync->>Sync: Build candidate text hit points from field source-map caret ranges
    Sync->>TypstIDE: jump_from_click(IdeWorld, PagedDocument, page.frame, candidate)
    TypstIDE-->>Sync: File offset for candidate point
    Sync->>Sync: Keep candidates whose backward sync target matches the focused caret
    Sync->>TypstIDE: jump_from_cursor(PagedDocument, Source, source-map offset) when no caret candidate matches
    TypstIDE-->>Sync: Preview page positions or fallback field positions
    Sync-->>API: PreviewElementPosition[]
    API-->>Preview: positions
    Preview->>Preview: Scroll page and draw non-layout-shifting caret cue
```

### Sync Notes

- Sync requests use the revision of the preview currently displayed, not the newest queued preview revision.
- Sync requests resolve against the preview revision that is actually displayed. Form edits made after that preview do not invalidate click sync for visible content because the retained preview includes its own Typst source snapshot.
- Newly added or newly rendered content cannot sync until a successful preview compile includes it.
- `Jump::Url` does not focus a form field in v1.
- Backward sync resolves clicks with Typst IDE frame hit testing and maps file offsets to field ranges first, then to element ranges.
- Forward sync caret cues use preview points that backward sync maps to the same field and UTF-16 caret offset. Field-level fallback positions use Typst IDE cursor-to-preview mapping.
- `editor::FocusField` is an action. Preview clicks, sidebar navigation, and other command-like focus surfaces dispatch the same `ActionInvocation`.
- `DocumentFocusState` stores `elementId`, `fieldId`, optional UTF-16 caret offset, preview revision, focus source, and a request id.
- Registered editor fields apply focus and caret placement from React state inside `useLayoutEffect`; preview sync does not mutate DOM selection directly.
- Project-level template inputs use editor field IDs prefixed with `project-input-` followed by the template input JSON pointer. Backend source-map ranges for those fields are owned by the `inputs` pseudo-element and use the JSON pointer as `field_id`, such as `/title`, `/running_head`, `/authors/0/name`, or `/affiliations/0`. Forward sync converts registered editor IDs to backend source-map IDs before calling preview sync, and backward sync converts backend input focus targets back to registered project input fields before updating `DocumentFocusState`.
- Template input collection and reference fields may map through related rendered fields when the raw stored value is not itself visible in the compiled document. For example, an author affiliation reference can resolve through the author's rendered name or the referenced affiliation label while keeping the focused field ID tied to the original template input path.
- Plain text fields can receive UTF-16 caret placement. Generated wrappers, references, inline equations, and rich segments that do not map to raw field text fall back to field-level focus with a safe caret offset.
- Typst labels remain stable source identifiers, but SVG output is not expected to contain Érgo-specific HTML data attributes.
