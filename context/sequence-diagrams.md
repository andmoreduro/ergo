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
    participant Preview as Canvas Preview
    participant API as Tauri API
    participant Session as Backend DocumentSession

    User->>UI: Edit field or shortcut
    UI->>State: Apply AST change + queue DocumentEvent
    State-->>UI: Immediate UI update

    State->>Worker: sync_events(batch)
    Worker->>Worker: Regenerate Typst into worker VFS
    Worker->>Worker: compile_preview (main + resources if dirty)
    Worker->>Worker: store_preview in PreviewSyncState
    Worker-->>State: CompilationResult (pages, outline, resources)
    State->>API: sync_document_events (backend mirror)
    API->>Session: apply_event on backend session
    API-->>State: Mirror accepted
    Preview->>Worker: render_page for viewport pages
    Preview-->>User: Canvas preview update
```

- Bootstrap (open/new project): `CompilerClient.bootstrap` and `sync_document_snapshot` both complete before the document sync barrier drains.
- Queued document events are acknowledged after the backend mirror accepts the same batch.
- Main preview and resource previews compile in WASM via `preview_pipeline`.
- Canvas rasterizes only viewport pages; zoom debounces per `preview_zoom_render_debounce_ms`.
- Preview does not shift layout with compile-status chrome while typing.
- **Undo/redo:** apply the stored `inverseEvent` / `forwardEvent` locally, then sync and mirror that same event. Destructive inverses carry restore payloads (`RestoreElement`, `RestoreTableRow`, `RestoreTableColumn`).

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
    API-->>UI: AST + project files
    UI->>Worker: bootstrap(ast, vfs files, template packages)
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
    participant Preview as Canvas Preview
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
    Worker->>Sync: jump_from_cursor / field candidates
    Sync-->>Preview: PreviewElementPosition[]
```

- Requests use the **displayed** preview revision, not the newest in-flight compile.
- Backward sync prefers `FieldSourceMapEntry`, then element `SourceMapEntry`.
- Forward sync resolves every preview occurrence of the focused field, then picks the caret position whose source offset is closest to the editor caret; when offsets tie, it prefers the page nearest the current preview anchor, then vertical position.
- Template project inputs use field ids `project-input-` + JSON pointer; backend `field_id` uses the pointer (e.g. `/title`).
- `editor::FocusField` is a stable action shared by preview clicks and sidebar navigation.
