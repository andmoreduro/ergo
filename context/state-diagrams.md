# State Diagrams

This document models the most important runtime lifecycles: frontend document editing, backend document source materialization, and compilation queue execution.

## 1. Frontend Document Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Welcome
    Welcome --> OpeningProject : Open .ergproj
    Welcome --> ActiveProject : New Project

    OpeningProject --> ActiveProject : AST loaded
    OpeningProject --> Error : open failed
    Error --> Welcome : dismiss

    ActiveProject --> Editing : document action
    Editing --> Editing : continuous input
    Editing --> SyncPending : schedule backend sync
    SyncPending --> Syncing : sync_document_snapshot
    Syncing --> ActiveProject : session status received
    Syncing --> SyncPending : newer AST exists
    Syncing --> Error : sync failed

    ActiveProject --> Saving : manual save / autosave
    Editing --> Saving : autosave
    Saving --> ActiveProject : archive written
    Saving --> Error : save failed

    ActiveProject --> Welcome : close project
```

### Notes

- React state updates immediately during `Editing`.
- Backend sync is asynchronous and coalesces to the latest AST snapshot.
- The frontend does not wait for compilation before letting users continue editing.

## 2. Backend DocumentSession Lifecycle

```mermaid
stateDiagram-v2
    direction TB

    [*] --> Empty
    Empty --> SnapshotLoaded : sync_snapshot(ast)
    SnapshotLoaded --> DetectingChanges : compare with cached fragments
    DetectingChanges --> UpdatingFragments : dirty elements found
    DetectingChanges --> WritingMetadata : no element changes
    UpdatingFragments --> AssemblingSections
    AssemblingSections --> WritingSources
    WritingMetadata --> WritingSources
    WritingSources --> Ready : VFS revisions updated
    Ready --> DetectingChanges : newer snapshot
    Ready --> [*] : clear project
```

### Notes

- `DocumentSession` owns the fragment cache, section assembly, source map, and project source layout.
- `main.typ` changes only when document-wide structure changes, such as section order, references, template metadata, or global source setup.
- `sections/{section-id}.typ` changes when a section's fragments change.
- `.ergproj/source_map.json` is regenerated from backend source ranges.

## 3. Compilation Queue Lifecycle

```mermaid
stateDiagram-v2
    direction TB

    [*] --> Idle
    Idle --> PreviewQueued : enqueue_preview_compile
    Idle --> ExportQueued : enqueue_export

    PreviewQueued --> PreviewQueued : newer preview replaces pending preview
    PreviewQueued --> PreviewCompiling : debounce disabled
    PreviewQueued --> Debouncing : debounce enabled
    Debouncing --> PreviewCompiling : debounce elapsed
    PreviewCompiling --> PreviewSucceeded : SVG compile ok and revision current
    PreviewCompiling --> PreviewFailed : diagnostics and revision current
    PreviewCompiling --> PreviewDropped : result revision stale

    PreviewSucceeded --> Idle : no exports pending
    PreviewFailed --> Idle : no exports pending
    PreviewDropped --> Idle : no exports pending
    PreviewSucceeded --> ExportQueued : exports pending
    PreviewFailed --> ExportQueued : exports pending
    PreviewDropped --> ExportQueued : exports pending

    ExportQueued --> PreviewQueued : preview arrives first
    ExportQueued --> ExportCompiling : preview queue clear
    ExportCompiling --> ExportSucceeded : export written
    ExportCompiling --> ExportFailed : diagnostics
    ExportSucceeded --> Idle
    ExportFailed --> Idle
```

### Notes

- Preview SVG compilation has priority over exports.
- Preview jobs are deduped to the latest source revision.
- Preview debounce is disabled in default settings. Users can enable it and configure `preview_debounce_ms` in global settings.
- Stale preview results are dropped and must not overwrite newer preview state.
- Exports compile only after preview work is clear.

## 4. Preview Renderer Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Empty
    Empty --> WaitingForPreview : project active
    WaitingForPreview --> LoadingSvgFiles : changed preview_pages
    WaitingForPreview --> ReusingSvgFiles : unchanged preview_pages
    LoadingSvgFiles --> ShowingPreview : read_preview_svg complete
    ReusingSvgFiles --> ShowingPreview : keep cached SVG text
    LoadingSvgFiles --> ShowingFallback : inline SVG compatibility payload available
    LoadingSvgFiles --> Error : SVG file read failed
    ShowingPreview --> LoadingSvgFiles : newer compile result
    ShowingPreview --> ResolvingSync : click page / active editor element
    ResolvingSync --> ShowingPreview : element or position resolved
    ResolvingSync --> ShowingPreview : no match / unavailable
    Error --> LoadingSvgFiles : newer compile result
    ShowingPreview --> Empty : close project
```

The preview must not insert or remove visible compile-status UI in a way that causes the page to jump while typing.

## 5. Preview Sync Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Empty
    Empty --> Retained : successful non-stale preview compile
    Retained --> Retained : newer successful non-stale preview compile
    Retained --> StaleForDocument : document session revision advances
    StaleForDocument --> Retained : newer successful non-stale preview compile

    Retained --> ResolvingClick : jump_from_preview_click
    Retained --> ResolvingElement : get_preview_positions_for_element
    ResolvingClick --> Retained : element / position / no match
    ResolvingElement --> Retained : positions / no match

    StaleForDocument --> Unavailable : sync request
    Unavailable --> StaleForDocument
```

### Notes

- The retained preview state contains the compiled `PagedDocument`, source-map snapshot, Typst source snapshot, source revision, and page metrics.
- Preview sync accepts requests for the retained preview revision. The current document-session revision may be newer while the displayed preview waits for the next successful compile.
- Backward sync resolves clicks with Typst IDE frame hit testing and maps file offsets to `SourceMapEntry` ranges.
- Forward sync resolves active elements with Typst IDE cursor-to-preview mapping.

## 6. Key Sequence Resolver Lifecycle

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Idle
    Idle --> Matched : single-stroke exact match
    Idle --> Pending : sequence prefix match
    Idle --> NoMatch : no binding matches

    Pending --> Matched : next stroke completes sequence
    Pending --> Pending : next stroke extends valid prefix
    Pending --> Cancelled : next stroke invalidates sequence
    Pending --> FallbackMatched : timeout with exact fallback
    Pending --> Idle : timeout without fallback / reset_key_sequence

    Matched --> Idle : ActionInvocation returned
    FallbackMatched --> Idle : fallback ActionInvocation dispatched
    Cancelled --> Idle
    NoMatch --> Idle
```

### Notes

- The resolver state is owned by Rust per window/session.
- Strokes use logical keys from `KeyboardEvent.key`, normalized for matching while preserving mnemonic shortcuts across layouts and languages.
- Context expressions are evaluated against React's current `ActionContextSnapshot`.
- If an exact binding is also a prefix of a longer binding, Rust returns `PendingSequence` with a fallback action. React dispatches that fallback when the sequence timeout expires.
- Bundled defaults should avoid prefix ambiguity. For example, `Ctrl+O` is only a prefix by default: `Ctrl+O Ctrl+O` opens a project and `Ctrl+O Ctrl+R` opens recent projects. Users may still opt into ambiguous prefix shortcuts through the keymap settings UI or JSON.
