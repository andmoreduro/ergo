# State Diagrams

Runtime lifecycles for frontend editing, backend document materialization, WASM preview compile, Canvas rendering, and keymap sequences. See `README.md` for the section index.

## 1. Frontend Document Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Welcome
    Welcome --> OpeningProject : open .ergproj
    Welcome --> ActiveProject : new project

    OpeningProject --> ActiveProject : AST loaded
    OpeningProject --> Error : open failed
    Error --> Welcome

    ActiveProject --> Editing : user edit
    Editing --> SyncPending : enqueue DocumentEvent(s)
    SyncPending --> Syncing : WASM sync + compile
    Syncing --> ActiveProject : preview applied
    Syncing --> Error : sync failed

    ActiveProject --> Saving : save / autosave
    Saving --> ActiveProject : archive written
    ActiveProject --> Welcome : close project
```

React updates immediately during `Editing`. WASM sync runs asynchronously without blocking further input. Undo and redo replay the history entry's ordered event list through the same sync transition used by normal edits.

## 2. Backend DocumentSession Lifecycle

```mermaid
stateDiagram-v2
    direction TB

    [*] --> Empty
    Empty --> SnapshotLoaded : sync_snapshot
    SnapshotLoaded --> Ready : sources written to VFS
    Ready --> ApplyingEvent : sync_document_event(s)
    ApplyingEvent --> Ready : event applied
    ApplyingEvent --> Error : invalid event
    Error --> Ready : no mutation
    Ready --> [*] : clear project
```

The backend session mirrors events for archive I/O; it does not compile Typst on the sync path.

## 3. WASM Preview Compile Lifecycle

```mermaid
stateDiagram-v2
    direction TB

    [*] --> Idle
    Idle --> Syncing : sync_events / bootstrap
    Syncing --> Compiling : VFS updated
    Compiling --> Retained : compile_preview succeeded
    Compiling --> Failed : diagnostics
    Failed --> Idle : user continues editing
    Retained --> Compiling : newer events
    Retained --> Stale : newer source_revision compiling
    Stale --> Retained : compile succeeded
```

`PreviewSyncState` updates on successful main compile. Resource document may be cached (comemo) until `dirty_resource_ids` changes.

While **Retained**, `PreviewSyncState` serves `jump_from_click` and `positions_for_focus` for the displayed revision; **Unavailable** when the requested revision does not match the retained preview.

## 4. Canvas Preview Renderer Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Empty
    Empty --> Waiting : project active
    Waiting --> Rasterizing : page enters viewport
    Rasterizing --> Showing : render_page complete
    Showing --> Rasterizing : scroll / zoom debounce
    Showing --> ResolvingSync : click or focus change
    ResolvingSync --> Showing : positions resolved
    Showing --> Empty : close project
```

No visible compile-status UI may resize the preview pane during typing.

## 5. Key Sequence Resolver Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Idle
    Idle --> Matched : exact single-stroke match
    Idle --> Pending : prefix match
    Idle --> NoMatch

    Pending --> Matched : sequence complete
    Pending --> Pending : valid extension
    Pending --> Cancelled : invalid stroke
    Pending --> FallbackMatched : timeout with prefix fallback
    Pending --> Idle : reset_key_sequence

    Matched --> Idle
    FallbackMatched --> Idle
    Cancelled --> Idle
    NoMatch --> Idle
```

Resolver state lives in Rust per window. Logical keys come from `KeyboardEvent.key`.
