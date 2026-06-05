# Package Diagrams

Source-module ownership and allowed dependency direction.

```mermaid
flowchart TB
    subgraph Frontend ["Frontend (src/)"]
        AppRoot[App + layout]
        Hooks[hooks/]
        Workers[workers/]
        TauriApi[api/tauri]
        Bindings[bindings generated]
    end
    subgraph WasmCrate ["ergo-engine-wasm"]
        WasmBindgen[wasm_bindgen API]
        WasmEngine[engine]
    end
    subgraph CoreCrate ["ergo-core"]
        Session[document_session]
        TypstSource[typst_source]
        PreviewPipe[preview pipeline]
        Vfs[vfs + world]
        Ast[ast + template_spec]
    end
    subgraph TauriShell ["Tauri shell (src-tauri/src)"]
        Lib[lib + commands]
        ArchivePkg[archive]
        SettingsPkg[settings]
        ActionsPkg[actions]
    end
    AppRoot --> Hooks
    Hooks --> Workers
    Hooks --> TauriApi
    Workers --> Bindings
    TauriApi --> Bindings
    WasmBindgen --> WasmEngine
    WasmEngine --> Session
    WasmEngine --> PreviewPipe
    Session --> Ast
    Session --> TypstSource
    PreviewPipe --> Vfs
    Lib --> Session
    Lib --> ArchivePkg
    Lib --> SettingsPkg
    Lib --> ActionsPkg
    ArchivePkg --> Vfs
    Workers == worker messages ==> WasmBindgen
    TauriApi == invoke ==> Lib
    Bindings -. ts-rs from .-> Ast
```

## Package Notes

- `editor/prosemirror/` owns the content-body ProseMirror schema, AST bridge, section diff → `DocumentEvent` translation, plugins, and React NodeViews for block objects. It depends on `state/` and `bindings/` but not on layout components except through NodeView adapters.
- `api/tauri` is the only frontend module that calls Tauri `invoke`.
- `workers/compiler.worker` loads `ergo-engine-wasm`; preview compiles never go through Tauri IPC.
- `document_session_commands` mirrors AST to the backend session; architecture tests forbid `compile_document` on that path.
- `ergo-core` also owns `preview_sync*`, `compile_artifacts`, `resource_watch`, `package_resolver`, and IPC DTO crates (`*_types`, `document_outline`, `document_resources`).
- `typst_source/` owns canonical Typst materialization: `lib.typ`, project page/text settings, per-element fragments, references, source-map field formatting, fragment hashing inputs, and low-level Typst literal formatting.
- `document_session*` owns AST snapshot/event orchestration, incremental fragment cache checks, project source layout assembly, and VFS writes.
- `archive` packs the backend VFS and asks `ergo-core` for template and document dependency package files; `compiler` commands handle font loading, source writes, and `write_bytes_to_path`.
- `actions*` owns catalog, context expressions, keymap validation, and per-window sequence state.
- IPC DTO crates export via `ts-rs` into `src/bindings/`; frontend must not hand-maintain binding mirrors or consume generated files from crate-local paths.
