# AGENTS.md — Érgo

## Design source of truth

The `context/` folder holds the canonical design documents. Before proposing or changing code, read:

1. `context/init.md` — AI operating prompt, architectural baseline, implementation rules
2. `context/component-diagram.md` — container/component architecture
3. `context/class-diagrams.md` — domain models, Rust structs, IPC types
4. `context/sequence-diagrams.md` — editing, compile, save, export, sync flows
5. `context/collaboration-diagrams.md` — message passing between runtime objects
6. `context/state-diagrams.md` — frontend, backend, compile queue, key sequence state machines
7. `context/distribution-diagram.md` — deployment, archive layout, storage boundaries
8. `context/user-stories.md` / `context/user-story-map.md` — feature scope and priority

When implementation and design docs conflict, preserve working code and update the design docs deliberately.

## Product intent

Érgo is a local-first, no-code Typst IDE for academic documents. Users edit structured forms — the app generates Typst, compiles it in Rust, and shows a live SVG preview. Target: authors/academics who want predictable formatting without writing raw Typst.

## Hard constraints

- **No external CSS/UI frameworks.** CSS Modules + design tokens only. No Tailwind, Bootstrap, Radix, MUI.
- **No frontend Typst source generation.** Rust `DocumentSession` owns canonical Typst source materialization.
- **All user-facing text must use typed Paraglide messages.** Spanish strings must use correct spelling (accents, ñ).
- **Never mutate React state directly.** Dispatch `ASTAction` through the reducer.
- **Actions must be routed through the action runtime.** Clicking a button and pressing a shortcut must dispatch the same `ActionInvocation`.
- **Do not start a dev server automatically.** User runs `pnpm tauri dev` manually.
- **Keep preview layout stable.** No visible compile-status text that shifts the preview while typing.
- **Sanitize user input in generated Typst.** User text must not inject raw Typst markup (unless explicitly a trusted-raw feature).

## Stack

- **Frontend**: React 18 + TypeScript + Vite + CSS Modules
- **Backend**: Rust (Tauri v2) — Typst document compiler
- **Package manager**: pnpm
- **Testing**: Vitest + jsdom + @testing-library/react
- **Storybook**: @storybook/react-vite (port 6006)

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Vite dev server (port 1420, strict port) |
| `pnpm test` | Compile paraglide, then `vitest run` |
| `pnpm test -- path/to/file.test.ts` | Run a single test file |
| `pnpm build` | paraglide compile → `tsc` → `vite build` |
| `pnpm storybook` | Storybook dev server (port 6006) |
| `pnpm tauri dev` | Full Tauri desktop app (runs `pnpm dev` internally) |
| `cargo test` | Run Rust tests (from `src-tauri/`) |

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
4. Compile queue triggers Typst compilation from VFS-backed `ErgoWorld` → emits SVG pages
5. Preview renders SVGs, handles click-to-source (backward sync) and source-to-preview (forward sync)

### Ownership split
- **React owns**: UI, action context tree, local `DocumentAST` with undo/redo, settings UI
- **Rust owns**: action catalog, keymap schema/validation, key sequence resolution, canonical Typst source generation, VFS, compile queue, preview sync, archive I/O

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
  components/           — Atomic design: atoms, molecules, organisms, screens, layout
  commands/             — Command registry, keymap, types
  actions/runtime.tsx   — Action dispatch framework + context tree
  settings/             — Global settings, keymap defaults + merge
  templates/            — Document template registry
  project/paths.ts      — .ergproj path helpers
  hooks/useCompiler.ts  — Compile queue event listener
  styles/               — global.css, variables.css (design tokens)
```

## Component pattern

```
Button/
  Button.tsx
  Button.module.css
  Button.test.tsx
  Button.stories.tsx     (optional)
```

## i18n (Paraglide)

- Locales: `en`, `es`
- Messages: `messages/{locale}.json`
- Import: `import { m } from "./paraglide/messages.js";`
- Usage: `m.menubar_new_project()`
- Requires paraglide compile before messages resolve

## Testing

- Co-located `*.test.ts(x)` with source
- Vitest: `jsdom` environment, `globals: true`
- RTL: prefer `screen.getByRole` with accessible names
- Mock Tauri IPC with `vi.mock()` for components calling `TauriApi`

## No lint/format/CI config

TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`) is the only enforcement. No ESLint, Prettier, or CI workflows exist.

## Implementation rules

1. Read context files and relevant source before coding.
2. Prefer existing architecture and source patterns over inventing new systems.
3. Add or update tests alongside new behavior (especially VFS patching, document session generation, command/keymap logic, settings, source maps, archive migration, compile queue).
4. Run focused tests first, then broader gates:
   - `pnpm test` (frontend)
   - `pnpm build` (typecheck)
   - `cargo test` (backend)
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
