# Package Diagrams

Source-module ownership and allowed dependency direction.

```mermaid
flowchart TB
    classDef mod fill:#ffffff,stroke:#34495e,stroke-width:1px,color:#2c3e50;
    classDef gen fill:#ecf0f1,stroke:#7f8c8d,stroke-width:1px,color:#2c3e50;
    classDef crate fill:#e8f4f8,stroke:#3498db,stroke-width:1px,color:#2c3e50;

    subgraph Frontend ["Frontend (src/)"]
        direction TB
        AppRoot["App + layout"]:::mod
        Hooks["hooks/ (compiler sync, lifecycle)"]:::mod
        Workers["workers/ (compilerClient, worker)"]:::mod
        TauriApi["api/tauri"]:::mod
        Bindings["bindings/ (generated)"]:::gen

        AppRoot --> Hooks
        Hooks --> Workers
        Hooks --> TauriApi
        Workers --> Bindings
        TauriApi --> Bindings
    end

    subgraph WasmCrate ["ergo-engine-wasm"]
        direction TB
        WasmEngine["engine"]:::crate
        WasmBindgen["wasm_bindgen API"]:::crate
        WasmBindgen --> WasmEngine
    end

    subgraph CoreCrate ["ergo-core"]
        direction TB
        Session["document_session*"]:::crate
        TypstSource["typst_source/"]:::crate
        PreviewPipe["preview_pipeline"]:::crate
        PreviewSync["preview_sync*"]:::crate
        CompileArt["compile_artifacts"]:::crate
        ResourceWatch["resource_watch"]:::crate
        Vfs["vfs + world + path_utils + package_resolver"]:::crate
        Ast["ast + template_spec"]:::crate
        DtoGen["*_types, document_outline, document_resources"]:::gen

        WasmEngine --> Session
        WasmEngine --> PreviewPipe
        WasmEngine --> PreviewSync
        PreviewPipe --> CompileArt
        PreviewPipe --> ResourceWatch
        Session --> Ast
        Session --> TypstSource
        TypstSource --> Ast
        ResourceWatch --> TypstSource
        CompileArt --> Vfs
        PreviewSync --> DtoGen
    end

    subgraph TauriShell ["Tauri shell (src-tauri/src)"]
        direction TB
        Lib["lib"]:::mod
        AppState["app_state"]:::mod
        DocCmds["document_session_commands"]:::mod
        ArchivePkg["archive"]:::mod
        SettingsPkg["settings"]:::mod
        ActionsPkg["actions*"]:::mod
        CompilerCmds["compiler (I/O helpers)"]:::mod

        Lib --> AppState
        Lib --> DocCmds
        Lib --> ArchivePkg
        Lib --> SettingsPkg
        Lib --> ActionsPkg
        Lib --> CompilerCmds
        DocCmds --> Session
        ArchivePkg --> AppState
        ArchivePkg --> Vfs
        AppState --> Vfs
    end

    Workers == "worker messages" ==> WasmBindgen
    TauriApi == "invoke" ==> Lib
    DocCmds --> Session
    Bindings -. "ts-rs from" .-> DtoGen

    style Frontend fill:#f4f6f7,stroke:#2c3e50,stroke-width:2px
    style WasmCrate fill:#f4f6f7,stroke:#2c3e50,stroke-width:2px
    style CoreCrate fill:#f4f6f7,stroke:#2c3e50,stroke-width:2px
    style TauriShell fill:#f4f6f7,stroke:#2c3e50,stroke-width:2px
```

## Package Notes

- `api/tauri` is the only frontend module that calls Tauri `invoke`.
- `workers/compiler.worker` loads `ergo-engine-wasm`; preview compiles never go through Tauri IPC.
- `document_session_commands` mirrors AST to the backend session; architecture tests forbid `compile_document` on that path.
- `ergo-core` owns Typst compilation, preview pipeline, preview sync, and Typst package cache resolution.
- `typst_source/` owns canonical Typst materialization: `lib.typ`, per-element fragments, references, source-map field formatting, fragment hashing inputs, and low-level Typst literal formatting.
- `document_session*` owns AST snapshot/event orchestration, incremental fragment cache checks, project source layout assembly, and VFS writes.
- `archive` packs the backend VFS and asks `ergo-core` for template package files; `compiler` commands handle font loading, source writes, and `write_bytes_to_path`.
- `actions*` owns catalog, context expressions, keymap validation, and per-window sequence state.
- IPC DTO crates export via `ts-rs` into `src/bindings/`; frontend must not hand-maintain binding mirrors or consume generated files from crate-local paths.
