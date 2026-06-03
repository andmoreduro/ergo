# Sequence Diagrams

Chronological flows. See `README.md` for which file owns each topic.

## 1. Real-Time Editing And Preview

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant UI as React UI
    participant State as Document State
    participant Worker as WASM Worker
    participant Preview as Preview Pages
    participant API as Tauri API
    participant Session as Backend DocumentSession

    User->>UI: Edit field or shortcut
    UI->>State: Apply AST change + queue DocumentEvent(s)
    State-->>UI: Immediate UI update

    State->>Worker: sync_events(batch)
    Worker->>Worker: Regenerate Typst into worker VFS
    Worker->>Worker: compile_preview (main + resources if dirty)
    Worker->>Worker: store_preview in PreviewSyncState
    Worker-->>State: CompilationResult (pages, outline, resources)
    State->>API: sync_document_events (backend mirror)
    API->>Session: apply_event on backend session
    API-->>State: Mirror accepted
    Preview->>Worker: render_svg_page for changed viewport pages
    Worker-->>Preview: Page SVG + metrics
    Preview->>Preview: Replace stable page innerHTML
    Preview-->>User: Preview page update
```

- Bootstrap (open/new project): `CompilerClient.bootstrap` clears the WASM VFS and `DocumentSession`, resets compiled preview state, resets WASM fonts, awaits lazy load of non-bundled project font families (all faces per family), then compiles; `sync_document_snapshot` on the backend completes before the document sync barrier drains. The UI clears preview pages on `sessionId` change and ignores compile results from a prior session. Edits compile without reloading fonts.
- Queued document events are acknowledged after the backend mirror accepts the same batch.
- Main preview and resource previews compile in WASM via `preview_pipeline`.
- Resource preview VFS uses the same `lib.typ` and `#show: apply` as the main document; `resources.typ` adds preview page dimensions and `#set page` / `#show page` overrides for a white background without headers or numbering. Sidebar thumbnails cap height at 40vh.
- Compiled outline comes from `document.introspector` on the paged document using the same heading filter as the PDF bookmark panel (`bookmarked: true`, or `bookmarked: auto` with `outlined: true`). The sidebar lists every compiled entry; editor headings match by text (including empty → `Untitled heading`), and other entries (e.g. front-matter sections with `outlined: false, bookmarked: true`) scroll the preview to that page.
- Main preview pages use `render_svg_page`; the worker returns serialized SVG markup and compiled page-frame metrics for layout, click mapping, and caret overlays.
- Main preview pages render only viewport pages whose content changed; unchanged visible pages keep their existing `innerHTML`. Zoom updates page layout without requesting a page rerender.
- Resource thumbnails use `render_resource_svg_page` and write SVG markup into stable thumbnail containers.
- Resource thumbnails use resource-specific revisions and wait for the matching main preview revision to paint before replacing thumbnail SVG.
- Failed compiles report localized toast notifications and keep the last successful preview-visible pages, outline, resources, source map, and preview revision.
- Preview does not shift layout with compile-status chrome while typing.
- **Undo/redo:** apply the stored `inverseEvents` / `forwardEvents` locally, then sync and mirror the full ordered event list with sequential event IDs. Destructive inverses carry restore payloads (`RestoreElement`, `RestoreTableRow`, `RestoreTableColumn`).

### Body clipboard paste

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant PM as ProseMirror Body Editor
    participant Paste as Clipboard Paste Handlers
    participant API as Tauri API
    participant Worker as WASM Worker
    participant State as Document State

    User->>PM: Paste (image on clipboard)
    PM->>Paste: handlePaste (first matching handler)
    Paste->>API: import_resource_bytes(file_name, bytes)
    API-->>Paste: AssetEntry + VFS path
    Paste->>Worker: writeFile(assets/…)
    Paste->>State: ADD_FIGURE, ADD_ASSET, UPDATE_FIGURE
    State-->>PM: Reconcile figure block
```

- Handlers live under `src/editor/clipboard/`; each handler exposes `canHandle` and `handle` so future formats (e.g. spreadsheet cells into tables) register without changing the ProseMirror plugin.
- Image paste follows `TemplateSpec.typst.resources.pasted_image.behavior` (`figure` inserts a figure with `asset_id` set).
- Asset paths use the same `assets/{name}` collision rules as `import_resource_file`.
- Paste is handled in the body editor only; nested table-cell editors keep native text paste until a dedicated handler exists.

## 2. Archive Save And Autosave

New project:

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant UI as React UI
    participant Dialog as New Project Dialog
    participant API as Tauri API
    participant Session as Backend DocumentSession

    User->>UI: New Project
    User->>Dialog: Name, folder, file name
    Dialog->>API: sync_document_snapshot(initial AST)
    API->>Session: Bootstrap backend session + VFS
    Dialog->>API: save_project(path)
    API-->>UI: Active project path
```

Pack archive (manual save and all autosave paths):

```mermaid
sequenceDiagram
    autonumber

    participant Autosave as Autosave Scheduler
    participant API as Tauri API
    participant Archive as Archive Manager

    Autosave->>Autosave: Wait for worker sync + backend mirror drain
    Autosave->>API: save_project(path)
    API->>Archive: Pack backend VFS
    Archive-->>Autosave: Saved
```

**Autosave triggers** (global `settings.json`): periodic interval, window blur, project close, app close. Each trigger uses the pack sequence when the project is dirty. Canonical archive paths are in `distribution-diagram.md`.

## 3. Archive Open

```mermaid
sequenceDiagram
    autonumber

    participant UI as React UI
    participant API as Tauri API
    participant Archive as Archive Manager
    participant Worker as WASM Worker

    UI->>API: open_project(path)
    API->>Archive: Unzip and mount VFS
    Archive-->>API: DocumentAST from document_state.json
    API->>Session: sync_document_snapshot(ast)
    Session-->>API: Generated Typst sources in backend VFS
    API-->>UI: AST + bootstrap files (assets/packages)
    UI->>Worker: bootstrap(ast, bootstrap files, template packages)
    UI->>API: sync_document_snapshot(ast)
```

## 4. Insert Reference

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant Dialog as Insert Reference Dialog
    participant State as Document State
    participant Worker as WASM Worker

    User->>Dialog: Pick bibliography or resource entry
    Dialog->>State: UPDATE_*_CONTENT or plain-text insert
    State->>Worker: sync_events + compile
    Worker-->>State: Preview with citation markers
```

## 5. Export

```mermaid
sequenceDiagram
    autonumber

    participant UI as Preview Toolbar
    participant Worker as WASM Worker
    participant API as Tauri API

    UI->>UI: Choose PDF / PNG / SVG
    UI->>Worker: export_*
    Worker-->>UI: bytes or SVG text
    UI->>API: write_bytes_to_path(destination)
```

PNG and SVG target the current preview page index.

## 6. Keymap Resolution

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant Runtime as Action Runtime
    participant API as Tauri API
    participant Resolver as Rust Keymap Resolver
    participant Handlers as Handler Chain

    User->>Runtime: KeyboardEvent
    Runtime->>API: resolve_key_event(logical key, context snapshot)
    API->>Resolver: Match sequence + context
    Resolver-->>Runtime: ActionResolution
    Runtime->>Handlers: Dispatch ActionInvocation upward from focus
```

Mouse commands use `dispatchAction` with the same action IDs. Keymap persistence: bundled defaults under app resources; overrides in `%APPDATA%/Ergo/keymap.json` (or XDG equivalent).

## 7. Preview And Editor Sync

Backward (preview click → editor):

```mermaid
sequenceDiagram
    autonumber

    actor User
    participant Preview as Preview Pages
    participant Hook as usePreviewCaretSync
    participant Worker as WASM Worker
    participant Sync as PreviewSyncState
    participant Runtime as Action Runtime

    User->>Preview: Click page
    Hook->>Worker: jump_from_click(page, x_pt, y_pt, displayed_revision)
    Worker->>Sync: Typst IDE jump + source-map lookup
    Sync-->>Hook: PreviewFocusTarget
    Hook->>Runtime: editor::FocusField
```

Forward (editor focus → preview caret):

```mermaid
sequenceDiagram
    autonumber

    participant Editor as Form Editor
    participant Hook as usePreviewCaretSync
    participant Worker as WASM Worker
    participant Sync as PreviewSyncState

    Editor->>Hook: DocumentFocusState change
    Hook->>Worker: positions_for_focus(target, displayed_revision)
    Worker->>Sync: exact caret roundtrip or field anchor lookup
    Sync-->>Preview: PreviewElementPosition[]
```

- Requests use the **displayed** preview revision, not the newest in-flight compile.
- Backward sync prefers `FieldSourceMapEntry`, then element `SourceMapEntry`.
- Forward sync with `caretUtf16Offset` uses exact roundtrip validation: the rendered preview point must map back through `jump_from_click` to the same form field and UTF-16 caret offset. Unresolved caret targets return `NoMatch`.
- Forward sync without `caretUtf16Offset` may use field or element anchoring. Approximate candidate selection prefers the page nearest the current preview anchor, then vertical position.
- Template project inputs use field ids `project-input-` + JSON pointer; backend `field_id` uses the pointer (e.g. `/title`).
- `editor::FocusField` is a stable action shared by preview clicks and sidebar navigation.
