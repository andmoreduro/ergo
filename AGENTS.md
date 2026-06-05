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
8. `context/requirements.md` — product scope as imperative, testable requirements (canonical for “what the system shall do”)
9. `context/user-stories.md` / `context/user-story-map.md` — same scope in narrative user-story form and journey map (`REQ*` ids map to `US*` / `Tech*` in `user-stories.md`)
10. `context/README.md` — index of which diagram file owns each topic (avoids duplicate lookups)

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
  - `requirements.md`: product capabilities as imperative requirements (`REQ*`), one-to-one with `user-stories.md`.
  - `user-stories.md` / `user-story-map.md`: narrative capability catalog and author journey; keep in sync with `requirements.md` when scope changes.
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
| `pnpm react-devtools` | Standalone React DevTools — start before `pnpm tauri dev`, then reload the app window |
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

Available scenarios are `small-document`, `typing-title`, `large-document`, and `typing-body-large` (incremental per-keystroke body edit inside a multi-page document — the realistic large-project latency case). The profiler loads the bundled `versatile-apa`/`umb-apa` template packages from `typst_templates/` into its VFS so scenarios compile without a Typst package cache. Release builds are required for meaningful profiler captures. Integration test: `cargo nextest run -p ergo-engine-wasm wasm_preview_profile`.

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
- Body undo/redo (`edit::Undo`, `edit::Redo`) resolve through the action runtime; the capture listener suppresses native contenteditable history in the ProseMirror body surface
- ProseMirror-owned synchronous shortcuts (body navigation arrows, Tab, Shift+arrow block selection) stay in `bodyKeyboardPlugin.ts` and are not user-bindable
- Table cell merge/split (`editor::MergeTableCells`, `editor::SplitTableCell`) and Alt+arrow cell navigation resolve through the action runtime; `tableCellBoundary` swallows plain/Ctrl arrows at the grid rim but defers Alt+arrow to `editor::MoveTableCell*`
- Context wrappers: `PreviewContext`, `CoverPageFieldContext`, `TableSettingsContext` alongside bibliography/resources/quote/dialog providers

### Project archive (`.ergproj`)
Zip archive containing durable project state: `assets/`, `packages/` (registry Typst deps), embedded template Typst package tree (`umb-apa/`, `versatile-apa/`, …), `.ergproj/document_state.json`, `.ergproj/template_spec.json`, `.ergproj/dependency_manifest.json`, `.ergproj/project_settings.json`, `.ergproj/template.json`, `.ergproj/source_map.json`, `.ergproj/field_source_map.json`. Generated Typst sources (`main.typ`, `sections/`, `references.bib`, …) and previews/exports are cache artifacts, not authoritative state. Projects embed their template manifest and Typst package on save so reopening does not depend on the installed app version.

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

Layers under `src/components/`:

| Layer | Role |
|-------|------|
| `atoms/` | Primitives and single-purpose controls |
| `molecules/` | Reusable composites used in **two or more** places (e.g. `DropdownMenu`, `Dialog`, `MenuPanel`, `FormField`) |
| `organisms/` | Feature-sized UI (settings, element editors, command palette) |
| `layout/` | App chrome and region composition (menubar, workspace panes) |
| `screens/` | Full-page views (welcome, error boundary) |

Dependency direction: `screens` / `layout` → `organisms` → `molecules` → `atoms`. Organisms and molecules must not import from `layout/`.

**Reuse rule:** Do not add a wrapper component for a single concrete use of another component. If the same composition is needed **multiple times within one feature area**, colocate it next to that feature (e.g. under the same `layout/` folder) rather than promoting it to `molecules/` unless a second unrelated consumer appears.

**Shared UI molecules (current):** `DropdownMenu` (anchored menus), `MenuPanel` (menu surface styling), `Dialog` (modal shell), `Toolbar`, `FormField`, field molecules.

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

### Test contracts, not product instances

Tests assert behavior against the **contract** the code implements: schema shapes, spec fields, merge/normalization logic, and minimal inline fixtures. They do not snapshot a shipped product instance (default JSON, a concrete field catalog, generated binding shapes, a bundled defaults document, etc.).

If a test would break when an instance is renamed or its defaults change, but the contract did not change, delete or rewrite the test in the same change. Do not add another coupled case beside it.

- Build minimal inline fixtures (`TemplateSpec`, `InputSchema`, `KeymapProfile`, …) in the test file.
- Use `createTestDocumentAST()` (`src/test/documentAstFixture.ts`) or `createDocumentAST("none")` for document state unless the test targets instance load or save.
- Derive field order, list-label style, outline titles, and option values from **spec fields** in the fixture, not from production ids or names in assertions.

### Layout

- Co-located `*.test.ts` with source (no `*.test.tsx` until RTL returns)
- Vitest: `jsdom` environment (DOM unit tests only), `globals: true`
- Prefer pure logic and Rust tests; push compile/archive/VFS invariants to `cargo nextest run`

### Before changing code

1. Run `pnpm test:changed` (or `vitest run <affected.test.ts>`) and read failures — do not assume green means the right tests exist.
2. Search for tests that import or describe the module you are editing (`rg 'from \"./foo\"' **/*.test.ts`, `rg 'describe.*Foo'`). Update or remove those tests in the **same change** as the behavior change.
3. **Audit those tests for product-instance coupling** (see above). Remove or rewrite coupled tests before adding new ones.
4. Do not add a new test file when an existing file already owns the behavior surface.

### When to add a test

Add or extend a test only when it guards a **regression**, **non-obvious invariant**, or **IPC/schema contract** that would realistically break again. Examples that earn tests: VFS patching, document session generation, keymap merge/validation, archive save/open, source maps, reducer commit policy.

Do **not** add a test solely because you touched a file. A bugfix needs a test only if the bug could recur without it.

### Do not add (delete on sight during review)

- **Product-instance snapshots** — asserting the shape of a shipped defaults file, catalog export, or other concrete instance instead of the contract
- **Existence checks** — `expect(typeof fn).toBe("function")`, `expect(handlers["id"]).toBeDefined()`, re-export smoke tests
- **Mirror tests** — asserting the same fact as TypeScript types, Paraglide keys, or generated `src/bindings/`
- **Config/catalog snapshots** — default JSON shape unless verifying merge/migration **logic**
- **One-liner wrappers** — pure pass-through with no branch (e.g. `formatX` calling `formatY`)
- **Duplicate chord/key tests** — one canonical file per shortcut normalization family (`shortcutKeyFromKeyboardEvent.test.ts`)
- **Diagnostic / temporary tests** — files named `*Diagnostic*` or tests added only to print state during debugging
- **RTL/component smoke** — label text, CSS class presence, snapshot of markup (deferred until RTL pass)

### When changing behavior

- **Update** tests that assert the old behavior; do not leave them failing or add a parallel test for the new path.
- **Remove** tests that only encoded the old design and no longer protect a product invariant.
- **Consolidate** overlapping cases into one table-driven `it.each` instead of many near-duplicate `it` blocks.

### Review bar (every `it` must pass)

1. *If this test failed in CI, would we fix production code or delete the test?* If “delete the test”, it should not exist.
2. *Does this test a contract or a concrete product instance?* If instance-only, rewrite against a minimal fixture or delete it.

### Commands

| Command | Use |
|---------|-----|
| `pnpm test:changed` | After local edits — only tests affected by the diff |
| `pnpm test` | Pre-merge gate |
| `cargo nextest run` | Backend / WASM-adjacent Rust |

## No lint/format/CI config

TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`) is the only enforcement. No ESLint, Prettier, or CI workflows exist.

## Implementation rules

1. Read context files and relevant source before coding.
2. Prefer existing architecture and source patterns over inventing new systems.
3. Follow **Testing** above: audit affected tests for product-instance coupling, update or remove them in the same change, and add tests only for regressions or non-obvious **contracts** (VFS, document session, keymap merge logic, settings, source maps, archive I/O).
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
