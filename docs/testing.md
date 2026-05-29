# Frontend testing

Vitest with `*.test.ts` only (no React Testing Library in the default suite). Run `pnpm test` before merge; use `pnpm test:changed` while iterating.

Vitest uses the `jsdom` environment so DOM geometry helpers (`contentSectionFocus`, `previewScroll`, `previewPageMetrics`) can build elements without React Testing Library.

UI integration tests (`*.test.tsx`, jsdom, RTL) are intentionally omitted until after the next major UI pass. Reintroduce them for wiring that pure tests cannot reach (action context tree, async preview races, full project lifecycle).

## Layers

| Layer | Where | Examples |
|-------|--------|----------|
| Pure logic | Co-located `*.test.ts` | `reducer`, `previewZoom`, `previewPageMetrics`, `fieldIds`, `outlineMatching` |
| Sync contract | `documentEvents.test.ts` | `verifyRoundTrip` per `ASTAction` |
| Architecture | — | Code review and `components/atoms/` layout |

## Adding tests

1. **Pure function or reducer?** Co-located `*.test.ts` on the module.
2. **Compiler / archive / keymap?** Rust tests in `src-tauri/` (`cargo nextest run`).
3. **UI wiring after RTL returns?** `*.test.tsx` with mocks; assert IPC, dispatch, focus geometry—not labels, CSS classes, or “did this string render?”.

## Avoid

- `className` / CSS module class assertions.
- `readFileSync` guards on source or stylesheets.
- Tests that only mirror visible copy or control labels.
- Duplicating the same invariant in unit tests and RTL once both exist.

## Preview

- `previewZoom` / `previewZoomInput`: zoom math (renderer-agnostic).
- `previewPageMetrics` / `previewScroll`: SVG layout and scroll helpers; no canvas raster-density APIs.
- Caret matching and click→Typst coordinates: Rust `preview_sync` tests.
- Re-add RTL for preview caret/scroll wiring after the next UI pass.

## Rust / bindings

`cargo nextest run` (from `src-tauri/`) skips ts-rs `export_bindings_*` per-type tests via `.config/nextest.toml`. After changing `#[ts(export)]` types, run `cargo test -p ergo export_typescript_bindings` to refresh `src/bindings/`.

Rust tests focus on VFS patching, document session generation, archive layout, action/keymap resolution, and `preview_sync` caret matching. `compile_artifacts::new_apa7_project_from_bundled_template_compiles_to_svg` syncs the default new-project AST (`test_fixtures::default_apa7_project_ast`, matching `createDefaultDocumentAST()`), loads the bundled `apa7` template spec, asserts canonical project files (`.ergproj/template.json`, outlines in `main.typ`), then compiles when `@preview/versatile-apa:7.2.0` is in the local Typst cache (skips otherwise). SVG preview invalidation is covered without per-event duplicate harnesses.
