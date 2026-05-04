# Sequence Diagrams

This document describes chronological flows through Érgo's architecture. The primary path uses backend-owned Typst source materialization: React updates the AST, Rust `DocumentSession` generates section files, the retained-source VFS feeds Typst, and the frontend loads generated SVG page files.

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
    participant Queue as CompilationQueue
    participant Sync as PreviewSyncState
    participant World as ErgoWorld
    participant Typst as Typst Engine
    participant Preview as Preview Renderer

    User->>UI: Types, edits, clicks, or triggers shortcut
    UI->>Commands: Dispatch action ID or typed form event
    Commands->>State: Apply typed document action
    State-->>UI: Immediate local UI update

    State->>API: sync_document_snapshot(ast)
    API->>Session: Send latest AST snapshot
    Session->>Session: Update dirty element fragments
    Session->>Session: Assemble dirty section files
    Session->>VFS: write_source(main.typ, sections/*.typ, metadata)
    VFS-->>Session: Return source revisions
    Session-->>API: DocumentSessionStatus(sourceMap, revision)

    API->>Queue: enqueue_preview_compile()
    Queue-->>API: CompilationJob(source_revision)
    Queue-->>API: emit queued / started events

    Queue->>VFS: Snapshot retained Typst sources
    Queue->>Typst: compile PagedDocument with source snapshot
    Typst->>World: World::source("main.typ")
    World->>VFS: read retained Typst Source
    VFS-->>World: Source
    World-->>Typst: Source
    Typst->>World: World::source("sections/{id}.typ")
    World->>VFS: read retained Typst Source
    VFS-->>World: Source
    World-->>Typst: Source

    Typst-->>Queue: PagedDocument
    Queue->>VFS: compare and write changed .ergproj/preview/svg/page-N.svg files
    Queue->>Sync: store_preview(revision, PagedDocument, sourceMap, sourceSnapshot)
    Queue-->>API: emit succeeded with preview_pages(changed)
    API->>VFS: read_preview_svg(page path)
    VFS-->>API: SVG text
    API-->>Preview: SVG page strings
    Preview-->>User: Updated live preview
```

### Flow Notes

- The frontend does not own canonical full Typst source generation.
- `patch_source` remains a lower-level VFS command for compatibility and focused source edits, but normal document editing syncs AST snapshots/events to `DocumentSession`.
- The preview result must be rejected if its source revision is stale.
- Preview SVG files under `.ergproj/preview/svg/` are generated artifacts, not authoritative document state.
- Frontend Typst generation utilities must not be used in the compile path. Backend `DocumentSession` is the only canonical source generator.
- The retained preview document is runtime state only. It contains the compiled `PagedDocument`, source-map snapshot, Typst source snapshot, and page metrics. It is kept for sync and discarded/replaced when a newer non-stale preview compile succeeds.
- Preview page SVG writes are page-granular. The backend compares rendered SVG text with the VFS file, writes only changed pages, and marks each `PreviewPageFile.changed` value. The frontend keeps unchanged page SVG strings in memory and reloads only changed pages.
- Preview debounce is disabled by default. When enabled in global settings, `preview_debounce_ms` controls the backend delay used to coalesce pending preview jobs.

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
    Dialog->>API: save_project(folder/file_name.ergproj, ast)
    API->>Archive: Write first canonical archive
    API-->>UI: Load active project and remember path
```

The generated project file name preserves accents and other non-ASCII letters, removes Windows-invalid filename characters, converts whitespace to `_`, lowercases the result, and appends `.ergproj` when missing. Manual file-name overrides still remove Windows-invalid filename characters and append `.ergproj`, but otherwise preserve the user's spelling.

```mermaid
sequenceDiagram
    autonumber

    participant UI as React UI
    participant API as Tauri API Client
    participant Session as DocumentSession
    participant VFS as VirtualFileSystem
    participant Archive as Archive Manager
    participant Disk as Host Disk

    UI->>API: save_project(path, ast)
    API->>Session: sync_snapshot(ast)
    Session->>VFS: write canonical project files
    Note right of VFS: main.typ, sections/*.typ, references.bib, .ergproj/*.json
    Session-->>API: DocumentSessionStatus

    API->>Archive: pack mounted VFS files
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
- `sections/{section-id}.typ`
- `assets/`
- `references.bib`
- `.ergproj/document_state.json`
- `.ergproj/dependency_manifest.json`
- `.ergproj/project_settings.json`
- `.ergproj/template.json`
- `.ergproj/source_map.json`

Generated preview/export files may exist in the VFS, but they should be treated as cache artifacts and can be regenerated.

## 3. Archive Open And Migration

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
    Session->>VFS: regenerate missing/outdated main.typ and sections/*.typ
    Session-->>API: DocumentSessionStatus
    API-->>UI: load AST into frontend state
```

### Migration Rule

If an archive has `.ergproj/document_state.json` but no `sections/`, the backend regenerates the canonical multi-file Typst layout from the AST. If an archive only contains a monolithic `main.typ` and no document state, it is a legacy Typst-only archive and cannot be loaded as a structured Érgo project without an import feature.

## 4. Export Queue

```mermaid
sequenceDiagram
    autonumber

    participant UI as React UI
    participant API as Tauri API Client
    participant Queue as CompilationQueue
    participant VFS as VirtualFileSystem
    participant World as ErgoWorld
    participant Typst as Typst Engine

    UI->>API: enqueue_export(format)
    API->>Queue: enqueue export job
    Queue-->>API: emit queued
    Queue->>Queue: wait until preview work is clear
    Queue->>Typst: compile with ErgoWorld
    Typst->>World: request sources/files
    World->>VFS: read retained sources/assets
    VFS-->>World: Source/Bytes
    Typst-->>Queue: rendered document
    Queue->>VFS: write .ergproj/exports/*
    Queue-->>API: emit succeeded or failed
```

Export jobs must not overtake pending preview jobs. Preview freshness is prioritized while the user is actively editing.

## 5. Keymap Resolution

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

Keymap settings are loaded from and saved to the app config file `keymap.json`, separate from general app settings in `settings.json`. The user config folder is named `Ergo`; bundled defaults live under the installed app resources as `defaults/default_keymap.json` and `defaults/default_settings.json`. The bundled keymap file owns default action bindings, while the user file persists profile selection and overrides. The keymap settings UI edits those overrides directly, so JSON customization and UI customization use the same model.

There is no frontend fallback shortcut resolver. Keyboard events are normalized in React only to form `LogicalKeyEvent`; matching, pending-sequence state, fallback timeout decisions, and context-expression evaluation belong to Rust.

## 6. Preview And Editor Sync

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
    participant Editor as Form Editor

    User->>Preview: Clicks visible SVG page
    Preview->>Preview: Convert DOM click through SVG viewBox to x/y points
    Preview->>API: jump_from_preview_click(page, x_pt, y_pt, displayed_revision)
    API->>Sync: Resolve click if displayed revision matches retained preview
    Sync->>TypstIDE: jump_from_click(IdeWorld, PagedDocument, page.frame, point)
    TypstIDE->>World: Resolve source spans
    World-->>TypstIDE: Retained preview Source
    TypstIDE-->>Sync: Jump::File(file_id, offset)
    Sync->>Sync: Map file offset to SourceMapEntry
    Sync-->>API: element_id or no match
    API-->>Preview: PreviewJumpResult
    Preview->>Editor: setActiveElementId(element_id) and focus matching form control
```

Forward sync starts from the form editor's active element:

```mermaid
sequenceDiagram
    autonumber

    participant Editor as Form Editor
    participant Preview as React SVG Preview
    participant API as Tauri API Client
    participant Sync as PreviewSyncState
    participant VFS as VirtualFileSystem
    participant TypstIDE as typst-ide jump APIs

    Editor->>Preview: activeElementId changes
    Preview->>API: get_preview_positions_for_element(element_id, displayed_revision)
    API->>Sync: Resolve element if displayed revision matches retained preview
    Sync->>Sync: Read retained section Source from preview snapshot
    Sync->>TypstIDE: jump_from_cursor(PagedDocument, Source, source-map offset)
    TypstIDE-->>Sync: Preview page positions
    Sync-->>API: PreviewElementPosition[]
    API-->>Preview: positions
    Preview->>Preview: Scroll page and draw non-layout-shifting marker
```

### Sync Notes

- Sync requests use the revision of the preview currently displayed, not the newest queued preview revision.
- Sync requests resolve against the preview revision that is actually displayed. Form edits made after that preview do not invalidate click sync for visible content because the retained preview includes its own Typst source snapshot.
- Newly added or newly rendered content cannot sync until a successful preview compile includes it.
- `Jump::Url` does not focus a form field in v1.
- Source-map byte ranges are half-open. This prevents adjacent fragments such as a heading followed by a paragraph from both owning the same byte offset when Typst reports a boundary click.
- V1 sync focuses the owning form element's primary editable control. Destructive/action buttons inside the element card are fallback targets only when no editable control exists.
- Exact character-offset cursor placement requires richer source-map ranges for escaped/generated text and is not part of the current sync contract.
- Typst labels remain stable source identifiers, but SVG output is not expected to contain Érgo-specific HTML data attributes.
