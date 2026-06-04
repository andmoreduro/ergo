# Component Diagram

High-level runtime containers, responsibilities, and IPC boundaries for the React frontend, WASM compiler worker, Tauri/Rust backend, and host OS.

## Architecture Overview

Érgo is a local-first desktop application:

1. **Frontend (React / TypeScript / Vite):** UI, action context tree, local `DocumentAST` with undo/redo, template metadata form fields, a ProseMirror-controlled content-body editor (one view per content section), preview page rendering, and orchestration hooks.
2. **WASM Compiler Worker:** Hot-path `DocumentSession`, VFS, main and resource preview compiles, `PreviewSyncState`, page rendering, and export rendering (`ergo-engine-wasm` + `ergo-core`).
3. **Backend (Tauri / Rust):** Typed actions and keymap resolution, mirrored `DocumentSession` and VFS for archive I/O, settings persistence, and host file/dialog I/O.
4. **Host OS:** WebView, `.ergproj` archives, app config under `Ergo`, and Typst package cache.

**Editable state vs compilable source:** React updates `DocumentAST` immediately. The WASM worker owns canonical Typst materialization and all preview compiles. The backend `DocumentSession` mirrors AST snapshots and events over IPC for save/open only.

## Component Diagram

```mermaid
flowchart TB
    classDef container fill:#f4f6f7,stroke:#2c3e50,stroke-width:2px,color:#2c3e50,font-weight:bold;
    classDef comp fill:#ffffff,stroke:#34495e,stroke-width:1px,color:#2c3e50;
    classDef db fill:#ecf0f1,stroke:#7f8c8d,stroke-width:1px,color:#2c3e50;

    subgraph Frontend ["Frontend Container"]
        direction TB
        UI["UI Components"]:::comp
        Actions["Action Runtime"]:::comp
        DocState["Document State + History"]:::comp
        AppOrch["App Orchestration"]:::comp
        PreviewUI["Preview Pages"]:::comp
        Sidebar["Workspace Sidebar"]:::comp
        TauriClient["Tauri API Client"]:::comp

        UI --> Actions
        Actions --> DocState
        AppOrch --> Actions
        AppOrch --> TauriClient
        DocState --> PreviewUI
        PreviewUI --> Sidebar
        DocState --> TauriClient
    end

    subgraph WasmWorker ["WASM Compiler Worker"]
        direction TB
        WorkerBridge["Compiler Client + Worker"]:::comp
        PreviewEngine["Preview Engine"]:::comp
        PreviewSync["Preview Sync State"]:::comp
        WorkerVFS["Worker VFS"]:::comp
        TypstCompile["Typst Compile + Page Render"]:::comp

        WorkerBridge --> PreviewEngine
        PreviewEngine --> WorkerVFS
        PreviewEngine --> TypstCompile
        TypstCompile --> PreviewSync
    end

    subgraph Backend ["Backend Container"]
        direction TB
        Handlers["Tauri IPC Handlers"]:::comp
        Session["DocumentSession (mirror)"]:::comp
        SourceGen["Section Source Generator"]:::comp
        VFS["VirtualFileSystem"]:::comp
        Archive["Archive Manager"]:::comp
        Settings["Settings Store"]:::comp
        ActionCatalog["Action Catalog + Keymap"]:::comp

        Handlers --> ActionCatalog
        Handlers --> Session
        Handlers --> Archive
        Handlers --> Settings
        Session --> SourceGen
        SourceGen --> VFS
        Archive --> VFS
    end

    subgraph System ["Host Operating System"]
        direction LR
        WebView["Native WebView"]:::db
        ProjectFiles[(".ergproj Archives")]:::db
        SettingsFile[("Ergo App Config")]:::db
        TypstCache[("Typst Package Cache")]:::db
    end

    Frontend -. "rendered in" .-> WebView
    DocState == "sync, compile, render, preview sync" ==> WorkerBridge
    PreviewUI == "render_svg_page, render_resource_svg_page, jump_from_click" ==> WorkerBridge
    TauriClient == "actions, settings, archive mirror, write_bytes" ==> Handlers
    Archive <== "read/write zip" ==> ProjectFiles
    Settings <== "read/write JSON" ==> SettingsFile
    TypstCompile <== "resolve packages" ==> TypstCache

    class Frontend container
    class WasmWorker container
    class Backend container
    class System container
```

## Component Notes

- **Frontend UI** follows atomic layers under `src/components/`: atoms (native controls), molecules (`Dialog`, `DropdownMenu`, `MenuPanel`, shared fields), organisms (feature editors and dialogs), layout (menubar and workspace regions), screens (welcome). Organisms do not import layout modules; shared types (e.g. outline targeting) live in `src/editor/` or bindings, not in layout files.
- **Preview Engine** wraps `DocumentSession`, `preview_pipeline`, dual `ErgoWorld` instances (main + resource previews with comemo), `PreviewSyncState`, main page SVG serialization, and resource thumbnail SVG serialization.
- **Preview Pages** own DOM layout, viewport observation, SVG page replacement, click coordinate conversion, and compile-driven page scroll. Main pages and resource thumbnails write worker-returned SVG markup into stable page containers.
- **DocumentSession (mirror)** on the backend applies the same typed events as WASM so `save_project` packs a consistent VFS. It does not compile on the IPC sync path.
- **Tauri API Client** imports IPC DTOs only from generated `src/bindings/`.
- **Action Runtime** dispatches stable action IDs for commands and shortcuts; Rust owns catalog, keymap schema, sequence resolution, and context matching.
- **Document State + History** (`DocumentContext`) stores local AST, queued events, undo entries `{ forwardEvents, inverseEvents }`, and focus state. `dispatch` and body `commitDocumentEvents` both commit through `COMMIT_EVENTS` and `applyDocumentEvents`; WASM compile is the hot path; the Tauri backend VFS mirror runs on bootstrap and before save, not per keystroke.
- **Archive Manager** packs the backend VFS on save; open mounts files and bootstraps from `.ergproj/document_state.json`.
- **VirtualFileSystem** retains Typst `Source` for text paths and bytes for assets; paths use `/` separators.
