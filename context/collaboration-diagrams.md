# Collaboration Diagrams

These diagrams emphasize the structural relationships and numbered messages between Érgo's major runtime objects.

## 1. Real-Time Editing And Preview

```mermaid
flowchart LR
    classDef comp fill:#f4f6f7,stroke:#34495e,stroke-width:2px,color:#2c3e50;

    User(("User"))
    UI["React UI"]
    Command["Command Registry"]
    State["Document State"]
    API["Tauri API Client"]
    Session["DocumentSession"]
    Cache["Fragment Cache"]
    VFS["Retained-Source VFS"]
    Watch["TypstWatch"]
    World["ErgoWorld"]
    Typst["Typst Engine"]
    Preview["Preview Renderer"]
    Sidebar["Workspace Sidebar"]

    User -- "1: edits document" --> UI
    UI -- "2: dispatches command/action" --> Command
    Command -- "3: updates AST + records event" --> State
    State -- "4: sync_document_event" --> API
    API -- "5: sends typed DocumentEvent" --> Session
    Session -- "6: applies event to canonical AST" --> Session
    Session -- "7: regenerates fragments" --> Cache
    Session -- "8: writes main + section + element files" --> VFS
    API -- "9: emit_resources when required" --> VFS
    API -- "10: mark_vfs_changed" --> Watch
    Watch -- "11: compiles with world" --> Typst
    Typst -- "12: requests sources/files" --> World
    World -- "13: reads retained Source/Bytes" --> VFS
    Watch -- "14: writes preview SVG files" --> VFS
    Watch -- "15: emits preview page paths" --> API
    API -- "16: read_preview_svg or inline content" --> Preview
    Watch -- "17: supplies compiled outline" --> API
    API -- "18: supplies resources catalog" --> Preview
    Preview -- "19: updates sidebar outline, resources + displayed revision" --> Sidebar
    Sidebar -- "20: dispatches outline focus action" --> Command
    Preview -- "21: updates document view" --> User

    class UI,Command,State,API,Session,Cache,VFS,Watch,World,Typst,Preview,Sidebar comp;
```

## 2. Save And Archive

```mermaid
flowchart TB
    classDef comp fill:#f4f6f7,stroke:#34495e,stroke-width:2px,color:#2c3e50;

    State["Document State"]
    API["Tauri API Client"]
    Session["DocumentSession"]
    VFS["VirtualFileSystem"]
    Archive["Archive Manager"]
    Disk[("Host Disk")]

    State -- "1: save_project(path)" --> API
    API -- "2: request archive pack" --> Archive
    Archive -- "3: read VFS file map" --> VFS
    VFS -- "4: return source, metadata, assets" --> Archive
    Archive -- "5: write .ergproj zip" --> Disk
    Disk -- "6: I/O complete" --> Archive
    Archive -- "7: save confirmed" --> API
    API -- "8: mark saved" --> State

    class State,API,Session,VFS,Archive comp;
```

## 3. Preview Watch Vs Export

```mermaid
flowchart LR
    classDef comp fill:#f4f6f7,stroke:#34495e,stroke-width:2px,color:#2c3e50;

    API["Tauri API Client"]
    Watch["TypstWatch"]
    ExportCmd["export_document command"]
    Compiler["Typst Engine"]
    VFS["VirtualFileSystem"]

    API -- "1: mark_vfs_changed on document sync" --> Watch
    Watch -- "2: background preview compile" --> Compiler
    Compiler -- "3: write .ergproj/preview/svg" --> VFS
    API -- "4: export_document on user command" --> ExportCmd
    ExportCmd -- "5: synchronous compile on IPC thread" --> Compiler
    Compiler -- "6: write .ergproj/exports" --> VFS

    class API,Watch,ExportCmd,Compiler,VFS comp;
```

## Collaboration Notes

- Bootstrap sends a document snapshot; normal edits, undo, and redo send typed document events, not canonical full Typst source or full AST snapshots.
- Saves pack the backend session's mounted VFS state. They do not receive a frontend AST payload.
- Dirty element fragments are cached in `DocumentSession`; section files assemble fragment includes.
- `VirtualFileSystem` is the compile surface. It normalizes paths and retains Typst `Source` objects for incremental parsing.
- `TypstWatch` owns background preview compilation. `export_document` is a separate synchronous export path.
- Resource catalog updates and resource preview SVG writes run from document sync handlers when snapshots or dirty resource IDs require them.
