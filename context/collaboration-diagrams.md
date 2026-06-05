# Collaboration Diagrams

Structural relationships and numbered messages for the edit-compile loop only. All other flows are sequence diagrams — see `README.md`.

## Real-Time Editing And Preview

```mermaid
flowchart LR
    User((User))
    UI[React UI]
    State[Document State]
    Worker[WASM Worker]
    Preview[Preview Pages]
    API[Tauri Client]
    Session[Backend DocumentSession]
    User -- 1 edit --> UI
    UI -- 2 update AST --> State
    State -- 3 sync + compile --> Worker
    Worker -- 4 result --> Preview
    Preview -- 5 view --> User
    State -- 6 mirror async --> API
    API -- 7 apply --> Session
```

## Notes

- Normal edits send typed `DocumentEvent` batches to WASM; bootstrap uses `sync_document_snapshot`.
- Backend mirroring is fire-and-forget for archive consistency; preview latency does not wait on it.
- Save and autosave: `sequence-diagrams.md` §2.
- Export: `sequence-diagrams.md` §5.
- Action routing and keymap resolution are omitted here; see `sequence-diagrams.md` §6.
