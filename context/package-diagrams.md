# Package Diagrams

This document describes source-module ownership and allowed dependency direction. It exists so module-level coupling rules do not leak into component, class, sequence, state, or distribution diagrams.

The package diagram is a design source of truth, not a history of refactors. It should describe the intended current architecture.

```mermaid
flowchart LR
    classDef mod fill:#ffffff,stroke:#34495e,stroke-width:1px,color:#2c3e50;
    classDef gen fill:#ecf0f1,stroke:#7f8c8d,stroke-width:1px,color:#2c3e50;

    subgraph Frontend_Packages ["Frontend Packages"]
        direction TB
        AppRoot["App Shell"]:::mod
        ProjectLifecycle["useProjectLifecycle"]:::mod
        SettingsLifecycle["useSettingsLifecycle"]:::mod
        AutosaveHook["useAutosave"]:::mod
        CommandPaletteHook["useCommandPalette"]:::mod
        AppActionHandlers["useAppActionHandlers"]:::mod
        CompileBridge["useCompileBridge"]:::mod
        SvgLoader["useSvgLoader"]:::mod
        TauriApiClient["api/tauri"]:::mod
        GeneratedBindings["src/bindings"]:::gen

        AppRoot --> ProjectLifecycle
        AppRoot --> SettingsLifecycle
        AppRoot --> AutosaveHook
        AppRoot --> CommandPaletteHook
        AppRoot --> AppActionHandlers
        CompileBridge --> TauriApiClient
        SvgLoader --> TauriApiClient
        ProjectLifecycle --> TauriApiClient
        SettingsLifecycle --> TauriApiClient
        CommandPaletteHook --> TauriApiClient
        TauriApiClient --> GeneratedBindings
    end

    subgraph Backend_Packages ["Backend Packages"]
        direction TB
        Lib["lib"]:::mod
        AppState["app_state"]:::mod
        CoreErrorsPkg["core_errors"]:::mod
        ActionsCommands["actions_commands"]:::mod
        ActionCatalogPkg["action_catalog"]:::mod
        ActionContextPkg["action_context"]:::mod
        ActionKeymapPkg["action_keymap"]:::mod
        ActionTypesPkg["action_types"]:::gen
        ActionsPkg["actions"]:::mod
        CompilerCommands["compiler commands"]:::mod
        CompilationQueuePkg["compilation_queue"]:::mod
        CompileArtifactsPkg["compile_artifacts"]:::mod
        CompileEventsPkg["compile_events"]:::mod
        CompilationTypes["compilation_types"]:::gen
        DocumentSessionCommands["document_session_commands"]:::mod
        DocumentSessionPkg["document_session"]:::mod
        DocumentSessionEventsPkg["document_session_events"]:::mod
        DocumentSessionGenerationPkg["document_session_generation"]:::mod
        DocumentSourceBuilderPkg["document_source_builder"]:::mod
        DocumentSessionTypes["document_session_types"]:::gen
        AstTypes["ast"]:::gen
        ArchivePkg["archive"]:::mod
        PreviewSyncCommands["preview_sync_commands"]:::mod
        PreviewSyncPkg["preview_sync"]:::mod
        PreviewSyncLookupPkg["preview_sync_lookup"]:::mod
        PreviewSyncTypesPkg["preview_sync_types"]:::gen
        VfsPkg["vfs"]:::mod
        WorldPkg["world"]:::mod
        PathUtilsPkg["path_utils"]:::mod
        SettingsPkg["settings"]:::mod

        Lib --> AppState
        Lib --> ActionsCommands
        Lib --> DocumentSessionCommands
        Lib --> PreviewSyncCommands
        Lib --> CompilerCommands
        ActionsCommands --> ActionsPkg
        ActionsCommands --> SettingsPkg
        ActionsPkg --> ActionCatalogPkg
        ActionsPkg --> ActionContextPkg
        ActionsPkg --> ActionKeymapPkg
        ActionsPkg --> ActionTypesPkg
        ActionCatalogPkg --> ActionTypesPkg
        ActionKeymapPkg --> ActionContextPkg
        ActionKeymapPkg --> ActionTypesPkg
        CompilerCommands --> AppState
        CompilerCommands --> CompilationQueuePkg
        CompilerCommands --> CompilationTypes
        CompilerCommands --> CompileEventsPkg
        DocumentSessionCommands --> AppState
        DocumentSessionCommands --> DocumentSessionPkg
        PreviewSyncCommands --> AppState
        PreviewSyncCommands --> PreviewSyncPkg
        AppState --> VfsPkg
        AppState --> CompilationQueuePkg
        AppState --> DocumentSessionPkg
        AppState --> PreviewSyncPkg
        CompilationQueuePkg --> CompileArtifactsPkg
        CompilationQueuePkg --> CompileEventsPkg
        CompilationQueuePkg --> CompilationTypes
        CompilationQueuePkg --> DocumentSessionPkg
        CompilationQueuePkg --> PreviewSyncPkg
        CompilationQueuePkg --> VfsPkg
        CompileArtifactsPkg --> CompilationTypes
        CompileArtifactsPkg --> VfsPkg
        CompileArtifactsPkg --> WorldPkg
        CompileArtifactsPkg --> PathUtilsPkg
        CompileArtifactsPkg --> CoreErrorsPkg
        DocumentSessionPkg --> DocumentSessionTypes
        DocumentSessionPkg --> DocumentSessionEventsPkg
        DocumentSessionPkg --> DocumentSessionGenerationPkg
        DocumentSessionPkg --> CoreErrorsPkg
        DocumentSessionPkg --> AstTypes
        DocumentSessionPkg --> VfsPkg
        DocumentSessionGenerationPkg --> DocumentSourceBuilderPkg
        DocumentSessionGenerationPkg --> DocumentSessionTypes
        DocumentSessionGenerationPkg --> AstTypes
        PreviewSyncPkg --> DocumentSessionTypes
        PreviewSyncPkg --> PreviewSyncLookupPkg
        PreviewSyncPkg --> PreviewSyncTypesPkg
        PreviewSyncPkg --> PathUtilsPkg
        PreviewSyncPkg --> WorldPkg
        PreviewSyncLookupPkg --> PreviewSyncTypesPkg
        PreviewSyncLookupPkg --> DocumentSessionTypes
        ArchivePkg --> AppState
        ArchivePkg --> VfsPkg
        ArchivePkg --> DocumentSessionPkg
        VfsPkg --> PathUtilsPkg
        WorldPkg --> VfsPkg
        WorldPkg --> PathUtilsPkg
        SettingsPkg --> ActionsPkg
    end

    GeneratedBindings -. "generated by ts-rs from" .-> CompilationTypes
    GeneratedBindings -. "generated by ts-rs from" .-> DocumentSessionTypes
    GeneratedBindings -. "generated by ts-rs from" .-> AstTypes
    GeneratedBindings -. "generated by ts-rs from" .-> ActionTypesPkg
    GeneratedBindings -. "generated by ts-rs from" .-> PreviewSyncTypesPkg

    style Frontend_Packages fill:#f4f6f7,stroke:#2c3e50,stroke-width:2px,color:#2c3e50
    style Backend_Packages fill:#f4f6f7,stroke:#2c3e50,stroke-width:2px,color:#2c3e50
```

## Package Notes

- `App Shell` composes focused lifecycle hooks. It should not re-implement project, settings, autosave, command palette, compile, or SVG loading details inline.
- `api/tauri` is the only frontend package that calls Tauri `invoke`. It imports IPC DTOs from generated `src/bindings/` files.
- `src/bindings/` is generated by Rust `ts-rs` exports. Frontend code must not keep hand-written DTO mirrors.
- `app_state` owns shared backend runtime handles. Backend command modules depend on it instead of defining their own shared state.
- Backend command modules own Tauri command attributes and `State` extraction. Core modules do not import Tauri command state.
- `actions` owns key event resolution state. `action_catalog`, `action_context`, and `action_keymap` own action descriptors, context expression evaluation, and keymap validation.
- `document_session` owns session state and VFS coordination. `document_session_events`, `document_session_generation`, and `document_source_builder` own AST event application, Typst source materialization, and field source mapping.
- `preview_sync` owns retained preview documents. `preview_sync_lookup` owns source-map and field-map offset resolution.
- `compilation_queue` owns scheduling. `compile_artifacts` owns Typst compilation, SVG page rendering, changed-page VFS writes, and export artifact generation.
- `compile_events` owns compile lifecycle event names.
- `compilation_types`, `document_session_types`, `preview_sync_types`, `action_types`, and `ast` export IPC-facing TypeScript bindings through `ts-rs`.
- `path_utils` owns virtual path normalization and `FileId` conversion. VFS, world, preview sync, and artifact code should reuse it instead of duplicating path logic.
