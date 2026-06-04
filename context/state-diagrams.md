# State Diagrams

Runtime lifecycles for frontend editing, backend document materialization, WASM preview compile, preview page rendering, and keymap sequences. See `README.md` for the section index.

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

React updates immediately during `Editing`. The content body is a controlled ProseMirror view: each local transaction maps to a forward/inverse `DocumentEvent` pair (one undo step), and AST changes from undo, preview focus, or toolbar actions reconcile back into the document without a separate PM history. WASM sync runs asynchronously without blocking further input. Undo and redo replay the history entry's ordered event list through the same sync transition used by normal edits.

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

While **Retained**, `PreviewSyncState` serves `jump_from_click` for the displayed revision; **Unavailable** when the requested revision does not match the retained preview. Forward preview sync scrolls to the changed page nearest the viewport anchor after compile; the UI does not call `positions_for_focus`.

## 4. Preview Page Renderer Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Empty
    Empty --> Waiting : project active
    Waiting --> Rendering : page enters viewport
    Rendering --> Showing : SVG innerHTML written
    Showing --> Rendering : changed visible page
    Showing --> Rendering : dirty resource thumbnail after main page paint
    Showing --> Empty : close project
```

No visible compile-status UI may resize the preview pane during typing.
The WASM worker renders main preview pages and resource thumbnails as serialized SVG markup plus compiled Typst page-frame metrics. React writes SVG into stable containers with `innerHTML`; unchanged pages keep their existing SVG content while changed visible pages are replaced in place. The stored metrics drive page layout and click mapping.
Main preview pages have render priority for a revision. Resource thumbnails use resource-specific revisions and write SVG after the main preview has painted that resource revision.

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
