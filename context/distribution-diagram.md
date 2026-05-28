# Distribution Diagram

Deployment topology, `.ergproj` layout, config files, and storage boundaries.

## Deployment Topology

Érgo ships as a native desktop app (Windows, Linux) using the OS WebView for the React UI and a Rust/Tauri backend for file I/O, settings, and archives. Typst compilation runs in a bundled WASM module inside the WebView worker.

```mermaid
flowchart TB
    classDef cloud fill:#e0f7fa,stroke:#3498db,stroke-width:2px,stroke-dasharray:5 5,color:#2c3e50;
    classDef machine fill:#ecf0f1,stroke:#2c3e50,stroke-width:2px,font-weight:bold,color:#2c3e50;
    classDef os fill:#ffffff,stroke:#7f8c8d,stroke-width:2px,color:#2c3e50;
    classDef artifact fill:#d5f5e3,stroke:#1abc9c,stroke-width:1px,color:#2c3e50;
    classDef db fill:#fcf3cf,stroke:#f1c40f,stroke-width:1px,color:#2c3e50;

    subgraph Internet ["External Network"]
        Registry["Typst Universe"]:::cloud
    end

    subgraph LocalMachine ["User Machine"]
        subgraph OS ["Host OS"]
            WebView["WebView + WASM worker"]:::os
            UserDocs[(".ergproj")]:::db
            AppConfig[("Ergo config")]:::db
            TypstCache[("Typst package cache")]:::db
        end

        subgraph App ["Érgo install"]
            FrontendBundle["React bundle"]:::artifact
            BackendBinary["Tauri backend"]:::artifact
            WasmModule["ergo-engine-wasm"]:::artifact
            Defaults["Bundled default JSON"]:::artifact
        end
    end

    FrontendBundle -.-> WebView
    WasmModule -.-> WebView
    FrontendBundle == IPC ==> BackendBinary
    BackendBinary --> UserDocs
    BackendBinary --> AppConfig
    BackendBinary --> Defaults
    BackendBinary --> TypstCache
    TypstCache -. package sources .-> WebView
    TypstCache -. package sources .-> UserDocs
    Registry -. package sources .-> TypstCache

    class LocalMachine machine
```

## `.ergproj` Archive Layout

Zip archive canonical layout:

```text
assets/
  diagrams/
packages/
  {namespace}/{name}/{version}/...
.ergproj/
  document_state.json
  dependency_manifest.json
  project_settings.json
  template.json
  source_map.json
  field_source_map.json
```

| Path | Role |
|------|------|
| `assets/` | Binary files referenced by `AssetEntry`, including durable generated diagram SVGs under `assets/diagrams/` |
| `packages/` | Mirrored Typst package files needed for offline WASM compilation |
| `.ergproj/document_state.json` | Canonical structured AST (required on open) |
| `.ergproj/source_map.json` | Element → Typst byte ranges |
| `.ergproj/field_source_map.json` | Field → Typst byte ranges and UTF-16 segments |
| `.ergproj/template.json` | Template identity and variant |

Optional cache paths (regenerable, not required to reopen):

```text
.ergproj/exports/
```

Preview pixels, `PreviewSyncState`, and export files are cache artifacts. They are not archive-authoritative.
Typst sources such as `main.typ`, `lib.typ`, `elements/{id}.typ`, `references.bib`, and `resources.typ` are runtime VFS materializations derived from `.ergproj/document_state.json`.

## App Configuration

Global settings outside project archives:

| Location | Files |
|----------|-------|
| Windows `%APPDATA%\Ergo\` | `settings.json`, `keymap.json` |
| Linux `$XDG_CONFIG_HOME/Ergo/` or `~/.config/Ergo/` | same |

Bundled install resources:

- `defaults/default_settings.json`
- `defaults/default_keymap.json`

Per-project overrides: `.ergproj/project_settings.json`.

## Online And Offline

- `dependency_manifest.json` references packages resolved from the mirrored project VFS first, then the local Typst package cache.
- Archive package sources use `packages/{namespace}/{name}/{version}/...` paths so the WASM worker can compile without direct host-cache access.
- External package download belongs to the Typst package cache outside the archive.

## Storage Notes

- VFS paths use `/` separators on all platforms.
- Saves pack durable project state from the backend session VFS after worker sync and backend mirror sync drain.
- Autosave defaults are controlled in global `settings.json` (`autosave_interval_ms`, blur/close toggles).
- Keymap schema: `action_id`, `context` expression, `sequence` of logical keys with modifiers.
