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
    Preview->>Worker: render_page for viewport pages
    Preview-->>User: Canvas preview update
```

- Bootstrap (open/new project): `CompilerClient.bootstrap` and `sync_document_snapshot` both complete before the document sync barrier drains.
- Queued document events are acknowledged after the backend mirror accepts the same batch.
- Main preview and resource previews compile in WASM via `preview_pipeline`.
- Resource preview VFS uses the same `lib.typ` and `#show: apply` as the main document; `resources.typ` adds preview page dimensions and `#set page` / `#show page` overrides for a white background without headers or numbering. Sidebar thumbnails cap height at 40vh.
- Compiled outline comes from `document.introspector` on the paged document (headings with `outlined: true`). The sidebar lists every compiled entry; editor headings match by text (including empty → `Untitled heading`), and other entries (e.g. bibliography title) scroll the preview to that page.
- Canvas rasterizes only viewport pages; zoom debounces per `preview_zoom_render_debounce_ms`.
- Resource thumbnails use resource-specific revisions and wait for the matching main preview revision to paint before rasterizing.
- Preview does not shift layout with compile-status chrome while typing.
- **Undo/redo:** apply the stored `inverseEvents` / `forwardEvents` locally, then sync and mirror the full ordered event list with sequential event IDs. Destructive inverses carry restore payloads (`RestoreElement`, `RestoreTableRow`, `RestoreTableColumn`).

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
    Worker->>Sync: exact caret roundtrip or field anchor lookup
    Sync-->>Preview: PreviewElementPosition[]
```

- Requests use the **displayed** preview revision, not the newest in-flight compile.
- Backward sync prefers `FieldSourceMapEntry`, then element `SourceMapEntry`.
- Forward sync with `caretUtf16Offset` uses exact roundtrip validation: the rendered preview point must map back through `jump_from_click` to the same form field and UTF-16 caret offset. Unresolved caret targets return `NoMatch`.
- Forward sync without `caretUtf16Offset` may use field or element anchoring. Approximate candidate selection prefers the page nearest the current preview anchor, then vertical position.
- Template project inputs use field ids `project-input-` + JSON pointer; backend `field_id` uses the pointer (e.g. `/title`).
- `editor::FocusField` is a stable action shared by preview clicks and sidebar navigation.
