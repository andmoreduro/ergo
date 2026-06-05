# Érgo — product capabilities

Érgo is a local-first desktop IDE for academic documents. Users edit structured forms and a ProseMirror body; Rust owns canonical Typst source generation; a WASM worker compiles and renders the live preview. This document catalogs what the product provides, grouped by functional area. Stories use the “As a user…” form but describe shipped behavior, not a backlog. The same scope appears as imperative requirements in `requirements.md` (`US*` / `Tech*` map to `REQ*`).

## Epic 1: Project and template management

- **US1.1 — Create project:** Create a new project from the welcome screen or menubar: choose a display name, save location (defaulting to the system documents folder), optional custom `.ergproj` filename, and a template (`none`, bundled **APA 7** `apa7`, or **UMB APA 7** `umb-apa`). The app materializes a `.ergproj` archive with embedded template spec, Typst package tree, and generated section sources.
- **US1.2 — Open project:** Open an existing `.ergproj` from the file picker or by path; the archive restores document AST, settings, bibliography, assets, and embedded template files into the backend session and WASM preview.
- **US1.3 — Recent projects:** Open a recent project from the welcome list, the **Open Recent** dialog (keyboard-navigable), or the file menu; remove entries from the recent list without deleting files.
- **US1.4 — Welcome entry point:** Start work from a welcome screen with new project, open project, open recent, command palette, and recent-project shortcuts before entering the workspace.
- **US1.5 — Close project:** Close the active project (with optional save prompts per autosave settings) and return to the welcome screen; backend session and VFS reset for a clean boundary.
- **US1.6 — Template-driven metadata forms:** Edit template-defined front matter through grouped form fields (authors with affiliation/degree references, bibliography metadata, UMB cover fields, dedication, symbols, abbreviations, abstracts, keywords, etc.) driven by each template’s `editor` manifest and locale messages.
- **US1.7 — Template variants and options:** For templates that declare variants (e.g. APA 7 student / professional / complete), switch variant in project settings. For templates that declare options (e.g. UMB cover emblem style), set options in project settings; values flow into generated Typst.
- **US1.8 — Outline and layout overrides:** In project settings, toggle which compiled outlines appear (tables, figures, equations, listings, appendices) and customize outline titles where the template supports it.
- **US1.9 — Dynamic author references:** When a template exposes affiliation and degree/title lists, author rows show reference checkboxes keyed to those lists (numeric or lowercase-alpha markers per template), avoiding duplicate metadata entry.
- **US1.10 — Document export:** Export the full compiled document as **PDF** (file menu) or as **PNG** / **SVG** page bundles from the preview toolbar (ZIP when multi-page).
- **US1.11 — Bibliography export:** Export the project reference list as a `.bib` file from the file menu.

## Epic 2: Settings and configuration

- **US2.1 — Global settings:** Configure application theme, UI locale (English / Spanish), default equation input syntax (Typst / LaTeX), default text and math fonts, autosave interval and triggers (focus loss, app close, project close), undo history limit, and optional Zotero translation-server integration for bibliography metadata lookup.
- **US2.2 — Project settings:** Override per-project paper size, document language, fonts, font size, table stroke width, template variant, template-specific options, and outline inclusion/title overrides without changing global defaults.
- **US2.3 — Keymap settings:** Choose a keymap profile, record and edit bindings (including multi-stroke sequences), view conflicts against the Rust action catalog, and persist overrides in user config.
- **US2.4 — Configurable undo depth:** Cap in-memory undo/redo steps via global `history_limit` to bound RAM use on long sessions.

## Epic 3: Workspace and navigation

- **US3.1 — Tri-column workspace:** Resize three columns—sidebar, editor (metadata form + body), and live preview—with persisted split ratios.
- **US3.2 — Sidebar panels:** Switch among **Outline** (compiled structure, jump to fields/elements), **Bibliography** (reference CRUD), and **Resources** (figures, tables, diagrams, equations with WASM resource previews).
- **US3.3 — Editor toolbar:** Insert and convert body elements (paragraph, headings levels 1–6, table, figure, block/inline equation, quote, list, diagram) via toolbar actions routed through the action runtime.
- **US3.4 — Menubar:** Localized menus for file (project lifecycle, PDF export, bibliography export), insert (subset of body elements), view (command palette, sidebar toggles, zoom), settings, and help placeholders.
- **US3.5 — Command palette:** Search and invoke catalog actions from the welcome screen and workspace with the same routing as menus and shortcuts.
- **US3.6 — Find and replace:** Open a find bar to search the document AST and ProseMirror body, step matches, and replace text with preview highlighting in the editor.
- **US3.7 — Keyboard actions:** Use logical-key shortcuts resolved in Rust (`default_keymap.json` + user overrides); actions dispatch through a context tree (app, workspace, editor, body, table cell, dialog, bibliography panel, etc.) with no frontend fallback resolver.
- **US3.8 — Custom keymaps:** Remap any catalog action in settings; menubar labels show effective shortcuts for the active profile.

## Epic 4: Document editing (no-code body and forms)

- **US4.1 — ProseMirror body:** Edit section body content in a structured rich-text surface with undo/redo, clipboard integration, and element-level operations.
- **US4.2 — Paragraph flow:** Press Enter in body text to split/create paragraphs; Backspace at block start merges with the previous block per template rules.
- **US4.3 — Headings:** Insert and toggle heading levels 1–6 from toolbar or shortcuts; template Typst rules control numbering and outline inclusion.
- **US4.4 — Inline embeds:** Insert inline equations and citation references inside rich-text fields; chips use distinct styling so embeds are visible in the form.
- **US4.5 — Tables:** Insert tables; edit cells in ProseMirror; add/remove rows and columns, merge/split cells, and adjust column widths via shortcuts and a settings panel (placement, caption, notes).
- **US4.6 — Figures:** Insert image figures (file pick or paste); configure width, caption, source, and note fields per template `element_overrides`.
- **US4.7 — Equations:** Edit block and inline equations with Typst or LaTeX **input** syntax; Rust sanitizes and emits Typst math for compile. A syntax toggle is available per field and as a global default.
- **US4.8 — Quotes:** Insert block and inline quotes with template-defined attribution fields governed by `quote_policy` on the template spec.
- **US4.9 — Lists:** Insert bullet, numbered, and definition lists with nested item editing.
- **US4.10 — Diagrams:** Author Mermaid diagram definitions; the app generates SVG assets, syncs them to the VFS, and shows resource previews.
- **US4.11 — Element settings:** Open an element settings panel for the focused table, figure, equation, quote, or list via toolbar or shortcut.
- **US4.12 — Delete confirmation:** Confirm before deleting a focused body element to avoid accidental loss.
- **US4.13 — Input sanitization:** User text in generated Typst is escaped/sanitized so raw Typst markup cannot be injected from standard form fields.
- **US4.14 — Template field types:** Render template inputs as strings, rich text, content blocks, simple lists, object groups, arrays (authorities, symbols, abbreviations), and equation fields, with labels translated via template locale messages and Paraglide UI strings.

## Epic 5: Live preview and persistence

- **US5.1 — Live preview:** WASM compiles Typst on document changes and paints pages in the preview pane without blocking the UI on full export.
- **US5.2 — Preview-first compile:** Preview compilation runs in a dedicated worker; compile-status UI does not shift preview layout during typing.
- **US5.3 — Autosave:** Save the `.ergproj` archive on a timer and on configured lifecycle events (window blur, app close, project close) when enabled.
- **US5.4 — Manual save:** Save on demand from the menubar or shortcut while a project is open.
- **US5.5 — Zoom and fit:** Zoom the preview and fit page width/height from view actions.

## Epic 6: Preview ↔ editor synchronization

- **US6.1 — Forward sync:** After compile, scroll the preview toward pages that changed so edits remain visible.
- **US6.2 — Backward sync:** Click a preview page to focus the corresponding editor field or body caret using WASM source maps and `FocusField` actions.
- **US6.3 — Outline and resource jumps:** Activate outline entries or resource rows to focus the underlying AST element or metadata field in the editor.

## Epic 7: Bibliography, references, and identity

- **US7.1 — Stable element IDs:** Every section and element carries an immutable id used for labels, references, source maps, and sync.
- **US7.2 — Bibliography editor:** Add, edit, and remove `references.bib` entries through sidebar forms (BibLaTeX-oriented fields).
- **US7.3 — Insert reference:** Open a searchable reference dialog to insert citations into body text or rich fields.
- **US7.4 — Metadata lookup:** Optionally fetch bibliography metadata from a configured Zotero translation server when adding or editing entries.
- **US7.5 — Resource catalog:** Sidebar lists document assets and generated elements with labels derived from captions or template defaults.

## Epic 8: Platform and localization

- **US8.1 — Desktop application:** Run as a Tauri v2 desktop app (frameless window, native open/save dialogs, filesystem IPC).
- **US8.2 — UI localization:** Switch interface language between English and Spanish via Paraglide (`messages/{locale}.json`); all chrome strings use typed `m.*()` accessors.
- **US8.3 — Template localization:** Bundled templates ship `locales/{lang}.json` message maps; the editor translates field labels through `TemplateSpec.messages` with UI locale fallback.

## Epic 9: Architecture and quality (technical)

These capabilities underpin the product but are not direct end-user features.

- **Tech9.1 — Design system:** CSS Modules and design tokens only (no external UI framework); atomic components under `src/components/atoms/`, composed into molecules, organisms, layout, and screens.
- **Tech9.2 — Rust Typst ownership:** `DocumentSession` mirrors the AST, tracks dirty fragments, assembles per-section `.typ` files, maintains source maps, and syncs the in-memory VFS; React never generates Typst source.
- **Tech9.3 — WASM preview engine:** `ergo-engine-wasm` compiles from the mirrored VFS, retains `PagedDocument`, exposes SVG page export, and runs resource previews off the main thread.
- **Tech9.4 — IPC type sync:** `ts-rs` generates `src/bindings/` TypeScript types from Rust command DTOs; hand-editing bindings is forbidden.
- **Tech9.5 — Action catalog:** Rust owns action ids, context expressions, catalog metadata, and keymap validation; React registers contexts and handler chains.
- **Tech9.6 — Automated tests:** Vitest for frontend logic; `cargo nextest` for Rust (VFS patching, document session generation, template spec, settings, archive I/O). React component tests and Playwright E2E are out of scope for the current test strategy.

## Out of product scope (current release)

The following ideas appear in older notes or adjacent tools but are **not** part of Érgo today:

- Online vs offline project modes (lightweight archive vs fully bundled dependencies toggle).
- Per-page or per-element export pickers beyond full-document export.
- User-defined manual labels on arbitrary text selections (only automatic element ids and template references).
- Math symbol autocomplete in the equation editor.
- In-app template authoring (templates are bundled JSON + Typst packages in the repo).
- Help menu documentation/about surfaces (menu entries exist as disabled placeholders).
- Cut/copy/paste menubar entries (clipboard works in editors; dedicated edit-menu actions are not wired).
