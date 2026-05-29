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

## Rust / bindings

`cargo nextest run` (from `src-tauri/`) skips ts-rs `export_bindings_*` per-type tests via `.config/nextest.toml`. After changing `#[ts(export)]` types, run `cargo test -p ergo export_typescript_bindings` to refresh `src/bindings/`.
