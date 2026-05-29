# AGENTS.md — Érgo

## Design source of truth

The `context/` folder holds the canonical design documents. Before proposing or changing code, read:

1. `context/component-diagram.md` — container/component architecture
2. `context/class-diagrams.md` — domain models, Rust structs, IPC types
3. `context/package-diagrams.md` — source-module ownership and dependency boundaries
4. `context/sequence-diagrams.md` — editing, compile, save, export, sync flows
5. `context/collaboration-diagrams.md` — message passing between runtime objects
6. `context/state-diagrams.md` — frontend, backend, typst watch, key sequence state machines
7. `context/distribution-diagram.md` — deployment, archive layout, storage boundaries
8. `context/user-stories.md` / `context/user-story-map.md` — feature scope and priority
9. `context/README.md` — index of which diagram file owns each topic (avoids duplicate lookups)

When implementation and design docs conflict, preserve working code and update the design docs deliberately.

## Context documentation rules

The context files describe the intended current design. They are not a changelog, implementation diary, status report, or place to record what recently changed.

- Write stable design facts. Avoid temporal phrasing such as "now", "previously", "new", "changed", "removed", "legacy", "before", or "after" unless the document explicitly describes a migration path.
- Replace obsolete design text with the current design. Do not append change notes that preserve outdated architecture as narrative history.
- Keep diagrams at their assigned abstraction level:
  - `component-diagram.md`: containers and major runtime components.
  - `class-diagrams.md`: domain models, Rust structs, IPC DTO shapes, and relationships between data types.
  - `package-diagrams.md`: source modules/packages, ownership, and allowed dependency direction.
  - `sequence-diagrams.md`: ordered runtime interactions for user-visible flows.
  - `collaboration-diagrams.md`: message passing and object cooperation.
  - `state-diagrams.md`: states, transitions, guards, and events.
  - `distribution-diagram.md`: deployment nodes, archive layout, config files, and storage boundaries.
- If a detail belongs in another diagram type, move it there instead of duplicating it or forcing it into the current file.
- Keep code-level module names out of component diagrams unless the module is also a runtime architectural component.
- Keep package dependency rules out of class diagrams. Class diagrams should describe data and type relationships, not source-file ownership.
- Keep implementation task lists, progress notes, caveats, and completed-work summaries out of `context/`. Put only durable product and architecture decisions there.
- When a design change touches multiple views, update only the views whose abstraction actually changes.

## Product intent

Érgo is a local-first, no-code Typst IDE for academic documents. Users edit structured forms — the app generates Typst, compiles it in WASM (Rust/`ergo-core`), and shows a live Canvas preview. Target: authors/academics who want predictable formatting without writing raw Typst.

## Hard constraints

- **No external CSS/UI frameworks.** CSS Modules + design tokens only. No Tailwind, Bootstrap, Radix, MUI.
- **No frontend Typst source generation.** Rust `DocumentSession` owns canonical Typst source materialization.
- **All user-facing text must use typed Paraglide messages.** Spanish strings must use correct spelling (accents, ñ).
- **Never mutate React state directly.** Dispatch `ASTAction` through the reducer.
- **Actions must be routed through the action runtime.** Clicking a button and pressing a shortcut must dispatch the same `ActionInvocation`.
- **Do not start a dev server automatically.** User runs `pnpm tauri dev` manually.
- **Keep preview layout stable.** No visible compile-status text that shifts the preview while typing.
- **Sanitize user input in generated Typst.** User text must not inject raw Typst markup (unless explicitly a trusted-raw feature).
- **No branches for unreleased formats.** Érgo is pre-release; keep current schemas strict instead of preserving old JSON/archive shapes.

## Template naming

Érgo **template ids** (bundled specs under `src-tauri/resources/templates/{id}/`, `DocumentAST.metadata.template_id`, `.ergproj/template.json`) name the product template. They are not Typst package names.

- Bundled APA 7 template id: **`apa7`** (`resources/templates/apa7/template.json`).
- Its Typst dependency is declared in the template spec as **`package.name`** (e.g. `@preview/versatile-apa`). Use that identifier only for imports, dependency manifests, and `collect_package_files` — not as an Érgo `template_id`.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + CSS Modules
- **Backend**: Rust (Tauri v2) — Typst document compiler
- **Package manager**: pnpm
- **Testing**: Vitest (`*.test.ts`); RTL deferred until after next major UI pass

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm build:wasm` | Release WASM into `src/wasm-compiler/` with `wasm-opt` (production; requires `wasm-pack`) |
| `pnpm build:wasm:dev` | Release WASM without `wasm-opt` (fast iteration; used by `pnpm dev`) |
| `pnpm dev` | `build:wasm:dev` then Vite dev server (port 1420, strict port) |
| `pnpm test` | Compile paraglide, then `vitest run` (full suite) |
| `pnpm test:changed` | Compile paraglide, then `vitest run --changed` (only tests affected by working-tree diff) |
| `pnpm build` | `build:wasm` → paraglide compile → `tsc` → `vite build` |
| `pnpm tauri dev` | Full Tauri desktop app (runs `pnpm dev` internally) |
| `cargo run --release -p ergo-engine-wasm --bin wasm_preview_profile -- --scenario typing-title --iterations 200` | Profile the WASM preview pipeline (sync → compile → canvas render) without Tauri/WebView |
| `cargo nextest run` | Run Rust tests via nextest (skips per-type `export_bindings_*` smoke tests; from `src-tauri/`) |
| `cargo test -p ergo export_typescript_bindings` | Regenerate `src/bindings/` after IPC type changes |

### Fast iteration

Use impact analysis to run only tests affected by your changes:

```bash
# Frontend — only tests whose dependencies changed (vs HEAD)
pnpm test:changed

# Frontend — only tests whose dependencies changed (vs main)
pnpm test -- --changed main

# Backend — nextest is 60-80% faster than cargo test
cargo nextest run

# Backend — single test or module with nextest
cargo nextest run test_fn_name
cargo nextest run -E "test(module_name::)"
```

Install `cargo-nextest` once: `cargo binstall cargo-nextest` (or `cargo install cargo-nextest`).

Before merging, run the full `pnpm test` + `cargo nextest run` suites.

### WASM preview profiling

Use the WASM preview profiling harness when isolating document sync, Typst compilation, and canvas rasterization from Tauri IPC, the worker, and WebView:

```bash
cd src-tauri
cargo build --release -p ergo-engine-wasm --bin wasm_preview_profile
cargo run --release -p ergo-engine-wasm --bin wasm_preview_profile -- --scenario typing-title --iterations 200
cargo run --release -p ergo-engine-wasm --bin wasm_preview_profile -- --scenario large-document --iterations 100 --json
```

Available scenarios are `small-document`, `typing-title`, and `large-document`. Release builds are required for meaningful profiler captures. Integration test: `cargo nextest run -p ergo-engine-wasm wasm_preview_profile`.

## Critical: paraglide compile must run first

`paraglide-js compile` generates `src/paraglide/` (runtime, messages, types). The `test` and `build` scripts do this automatically, but running `tsc` or `vitest` directly will fail with import errors.

## Auto-generated code — never hand-edit

- `src/bindings/` — TS types from Rust via `ts-rs` (generated during Rust compilation)
- `src/paraglide/` — i18n runtime from `@inlang/paraglide-js`

## Key architecture

### State flow
1. User edits → `dispatch(ASTAction)` → reducer updates `DocumentAST` (immediate UI response)
2. AST syncs to backend via `syncDocumentSnapshot()` / `syncDocumentEvent()`
3. `DocumentSession` detects dirty fragments → assembles section `.typ` files → writes to VFS
4. WASM worker (`ergo-engine-wasm`) compiles from the mirrored VFS → Canvas page renders in the preview pane
5. WASM worker compiles the main document and resource previews; backend mirrors AST for archive I/O only
6. Backend `DocumentSession` mirrors AST via IPC for archive I/O and resource previews

### Ownership split
- **React owns**: UI, action context tree, local `DocumentAST` with undo/redo, settings UI
- **Rust owns**: action catalog, keymap schema/validation, key sequence resolution, canonical Typst source generation, backend VFS mirror, archive I/O
- **WASM worker owns**: all Typst compilation (main preview + resource previews), canvas rendering, preview sync

### Action + keymap model
- Rust owns typed action IDs, action catalog, context-expression matching, logical-key normalization, multi-stroke sequence state
- React owns `ActionContextNode` registration and action handler chain (focused context → parent walk)
- Logical keys from `KeyboardEvent.key`, not physical positions
- Multi-stroke sequences supported (e.g. `Ctrl+O Ctrl+O` opens, `Ctrl+O Ctrl+R` opens recent)
- No frontend fallback shortcut resolver

### Project archive (`.ergproj`)
Zip archive containing: `main.typ`, `sections/{section-id}.typ`, `assets/`, `references.bib`, `.ergproj/document_state.json`, `.ergproj/dependency_manifest.json`, `.ergproj/project_settings.json`, `.ergproj/template.json`, `.ergproj/source_map.json`. Generated previews/exports are cache artifacts, not authoritative state.

### VFS
In-memory virtual filesystem. Text files stored as retained Typst `Source` objects (for incremental parsing) with revisions. Binary files as bytes. Paths normalized to `/`.

## Frontend directory map

```
src/
  main.tsx              — entry point
  App.tsx               — root: state, commands, dialogs, routing
  api/tauri.ts          — Tauri IPC bridge (all invoke() calls)
  state/                — DocumentContext (useReducer + undo/redo)
    ast/                — AST actions, reducer, defaults
  components/           — Atomic design: atoms, molecules, organisms, screens, layout (native controls only in atoms)
  commands/             — Command registry, keymap, types
  actions/runtime.tsx   — Action dispatch framework + context tree
  settings/             — Global settings, keymap defaults + merge
  hooks/useTemplateSpec.ts — Template spec from Rust via get_template_spec
  project/paths.ts      — .ergproj path helpers
  hooks/                — compile bridge, SVG loader, autosave, project/settings lifecycle hooks
  styles/               — global.css, variables.css (design tokens)
```

## Component pattern

Atomic design is mandatory: `<button>`, `<input>`, `<select>`, `<textarea>`, and `contentEditable` may appear only under `src/components/atoms/`. Higher layers compose atoms and molecules.

```
Button/
  Button.tsx
  Button.module.css
```

## i18n (Paraglide)

- Locales: `en`, `es`
- Messages: `messages/{locale}.json`
- Import: `import { m } from "./paraglide/messages.js";`
- Usage: `m.menubar_new_project()`
- Requires paraglide compile before messages resolve

## Testing

See `docs/testing.md` for layers, what to add, and what to avoid.

- Co-located `*.test.ts` with source (no `*.test.tsx` until RTL returns)
- Vitest: `jsdom` environment (DOM unit tests only), `globals: true`
- Prefer pure logic and Rust tests; no label/CSS smoke tests

## No lint/format/CI config

TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`) is the only enforcement. No ESLint, Prettier, or CI workflows exist.

## Implementation rules

1. Read context files and relevant source before coding.
2. Prefer existing architecture and source patterns over inventing new systems.
3. Add or update tests alongside new behavior (especially VFS patching, document session generation, command/keymap logic, settings, source maps, archive save/open, typst watch).
4. Run focused tests first, then broader gates:
   - `pnpm test` (frontend)
   - `pnpm build` (typecheck)
   - `cargo nextest run` (backend)
5. Every design or behavior change must update the relevant `context/` design file in the same change.
6. Preserve immutable IDs on every document section and element — they power labels, references, source maps, and sync.
7. Preserve user changes in the working tree — do not revert unrelated files.
8. Use `ts-rs` for Rust-to-TypeScript IPC types crossing the Tauri boundary. Never hand-maintain binding files.

## Architectural direction

When reducing drift, prefer:
- Move compile scheduling and Typst source ownership into Rust
- Keep React focused on UI, command dispatch, local editing responsiveness, and undo/redo
- Keep `DocumentSession` responsible for AST snapshots, dirty tracking, fragment generation, section assembly, source maps, and VFS sync
- Keep `ErgoWorld` a thin Typst `World` implementation that reads from VFS
- Keep archive save/open aligned with canonical `.ergproj` layout
- Expand template behavior through manifests instead of hardcoding template logic in UI
