# Collaboration Diagrams

Structural relationships and numbered messages for the edit-compile loop only. All other flows are sequence diagrams — see `README.md`.

## Real-Time Editing And Preview

```mermaid
flowchart LR
    classDef comp fill:#f4f6f7,stroke:#34495e,stroke-width:2px,color:#2c3e50;

    User(("User"))
    UI["React UI"]
    Actions["Action Runtime"]
    State["Document State"]
    Worker["WASM Compiler Worker"]
    Preview["Preview Pages"]
    Sidebar["Workspace Sidebar"]
    API["Tauri API Client"]
    Session["Backend DocumentSession"]

    User -- "1: edits" --> UI
    UI -- "2: action / form event" --> Actions
    Actions -- "3: update AST + queue event" --> State
    State -- "4: sync_events + compile" --> Worker
    Worker -- "5: Typst + retained preview" --> Worker
    Worker -- "6: page list + outline + resources" --> Preview
    Preview -- "7: render SVG page for viewport" --> Worker
    Preview -- "8: outline + resources" --> Sidebar
    State -- "9: mirror events (async)" --> API
    API -- "10: apply on backend session" --> Session
    Preview -- "11: updated view" --> User

    class UI,Actions,State,Worker,Preview,Sidebar,API,Session comp;
```

## Notes

- Normal edits send typed `DocumentEvent` batches to WASM; bootstrap uses `sync_document_snapshot`.
- Backend mirroring is fire-and-forget for archive consistency; preview latency does not wait on it.
- Save and autosave: `sequence-diagrams.md` §2.
- Export: `sequence-diagrams.md` §5.
