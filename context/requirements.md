# Érgo — product requirements

Érgo is a local-first desktop IDE for academic documents. Users edit structured forms and a ProseMirror body; Rust owns canonical Typst source generation; a WASM worker compiles and renders the live preview. This document states the same product scope as `user-stories.md` in imperative, testable form. Requirement ids (`REQ*`) map one-to-one to story ids (`US*` / `Tech*`) in `user-stories.md`.

## Epic 1: Project and template management

- **REQ1.1:** The application shall allow creating a new project from the welcome screen or menubar by collecting a display name, save location (defaulting to the system documents folder), an optional custom `.ergproj` filename, and a template (`none`, bundled APA 7 `apa7`, or UMB APA 7 `umb-apa`). Creation shall materialize a `.ergproj` archive with embedded template spec, Typst package tree, and generated section sources.
- **REQ1.2:** The application shall open an existing `.ergproj` from the file picker or by path and restore document AST, settings, bibliography, assets, and embedded template files into the backend session and WASM preview.
- **REQ1.3:** The application shall list recent projects on the welcome screen and in an **Open Recent** dialog (keyboard-navigable) and file menu; the user shall be able to open a recent project or remove an entry without deleting the file on disk.
- **REQ1.4:** The application shall provide a welcome screen with new project, open project, open recent, command palette, and recent-project shortcuts before entering the workspace.
- **REQ1.5:** The application shall close the active project (with optional save prompts per autosave settings), return to the welcome screen, and reset the backend session and VFS.
- **REQ1.6:** The application shall render template-defined front matter as grouped form fields (authors with affiliation/degree references, bibliography metadata, UMB cover fields, dedication, symbols, abbreviations, abstracts, keywords, and related inputs) driven by each template’s `editor` manifest and locale messages.
- **REQ1.7:** For templates that declare variants (e.g. APA 7 student / professional / complete), the application shall allow switching variant in project settings. For templates that declare options (e.g. UMB cover emblem style), the application shall allow setting options in project settings; values shall flow into generated Typst.
- **REQ1.8:** In project settings, the application shall allow toggling which compiled outlines appear (tables, figures, equations, listings, appendices) and customizing outline titles where the template supports it.
- **REQ1.9:** When a template exposes affiliation and degree/title lists, author rows shall show reference checkboxes keyed to those lists (numeric or lowercase-alpha markers per template) to avoid duplicate metadata entry.
- **REQ1.10:** The application shall export the full compiled document as PDF from the file menu and as PNG or SVG page bundles from the preview toolbar (ZIP when multi-page).
- **REQ1.11:** The application shall export the project reference list as a `.bib` file from the file menu.

## Epic 2: Settings and configuration

- **REQ2.1:** The application shall provide global settings for theme, UI locale (English / Spanish), default equation input syntax (Typst / LaTeX), default text and math fonts, autosave interval and triggers (focus loss, app close, project close), undo history limit, and optional Zotero translation-server integration for bibliography metadata lookup.
- **REQ2.2:** The application shall provide per-project settings that override paper size, document language, fonts, font size, table stroke width, template variant, template-specific options, and outline inclusion/title overrides without changing global defaults.
- **REQ2.3:** The application shall provide keymap settings to choose a profile, record and edit bindings (including multi-stroke sequences), view conflicts against the Rust action catalog, and persist overrides in user config.
- **REQ2.4:** The application shall cap in-memory undo/redo steps via global `history_limit` to bound RAM use on long sessions.

## Epic 3: Workspace and navigation

- **REQ3.1:** The workspace shall present three resizable columns—sidebar, editor (metadata form + body), and live preview—with persisted split ratios.
- **REQ3.2:** The sidebar shall switch among **Outline** (compiled structure, jump to fields/elements), **Bibliography** (reference CRUD), and **Resources** (figures, tables, diagrams, equations with WASM resource previews).
- **REQ3.3:** The editor toolbar shall insert and convert body elements (paragraph, headings levels 1–6, table, figure, block/inline equation, quote, list, diagram) via actions routed through the action runtime.
- **REQ3.4:** The menubar shall provide localized menus for file (project lifecycle, PDF export, bibliography export), insert (subset of body elements), view (command palette, sidebar toggles, zoom), settings, and help placeholders.
- **REQ3.5:** The application shall provide a command palette on the welcome screen and in the workspace to search and invoke catalog actions with the same routing as menus and shortcuts.
- **REQ3.6:** The application shall provide a find bar to search the document AST and ProseMirror body, step matches, and replace text with preview highlighting in the editor.
- **REQ3.7:** The application shall resolve logical-key shortcuts in Rust (`default_keymap.json` + user overrides) and dispatch actions through a context tree (app, workspace, editor, body, table cell, dialog, bibliography panel, and related contexts) without a frontend fallback resolver.
- **REQ3.8:** The application shall allow remapping any catalog action in settings; menubar labels shall show effective shortcuts for the active profile.

## Epic 4: Document editing (no-code body and forms)

- **REQ4.1:** The application shall provide a ProseMirror body surface for section content with undo/redo, clipboard integration, and element-level operations.
- **REQ4.2:** In body text, Enter shall split or create paragraphs; Backspace at block start shall merge with the previous block per template rules.
- **REQ4.3:** The application shall support inserting and toggling heading levels 1–6 from toolbar or shortcuts; template Typst rules shall control numbering and outline inclusion.
- **REQ4.4:** The application shall support inline equations and citation references inside rich-text fields; embed chips shall use distinct styling so embeds are visible in the form.
- **REQ4.5:** The application shall support table insertion, ProseMirror cell editing, add/remove rows and columns, merge/split cells, column width adjustment via shortcuts, and a settings panel (placement, caption, notes).
- **REQ4.6:** The application shall support image figures (file pick or paste) with configurable width, caption, source, and note fields per template `element_overrides`.
- **REQ4.7:** The application shall support block and inline equations with Typst or LaTeX **input** syntax; Rust shall sanitize and emit Typst math for compile. A syntax toggle shall be available per field and as a global default.
- **REQ4.8:** The application shall support block and inline quotes with template-defined attribution fields governed by `quote_policy` on the template spec.
- **REQ4.9:** The application shall support bullet, numbered, and definition lists with nested item editing.
- **REQ4.10:** The application shall accept Mermaid diagram definitions, generate SVG assets, sync them to the VFS, and show resource previews.
- **REQ4.11:** The application shall open an element settings panel for the focused table, figure, equation, quote, or list via toolbar or shortcut.
- **REQ4.12:** The application shall confirm before deleting a focused body element.
- **REQ4.13:** User text in generated Typst shall be escaped or sanitized so raw Typst markup cannot be injected from standard form fields.
- **REQ4.14:** The application shall render template inputs as strings, rich text, content blocks, simple lists, object groups, arrays (authorities, symbols, abbreviations), and equation fields, with labels translated via template locale messages and Paraglide UI strings.

## Epic 5: Live preview and persistence

- **REQ5.1:** A WASM worker shall compile Typst on document changes and paint pages in the preview pane without blocking the UI on full export.
- **REQ5.2:** Preview compilation shall run in a dedicated worker; compile-status UI shall not shift preview layout during typing.
- **REQ5.3:** The application shall save the `.ergproj` archive on a timer and on configured lifecycle events (window blur, app close, project close) when autosave is enabled.
- **REQ5.4:** The application shall support manual save from the menubar or shortcut while a project is open.
- **REQ5.5:** The application shall support zooming the preview and fitting page width or height from view actions.

## Epic 6: Preview ↔ editor synchronization

- **REQ6.1:** After compile, the preview shall scroll toward pages that changed so edits remain visible.
- **REQ6.2:** Clicking a preview page shall focus the corresponding editor field or body caret using WASM source maps and `FocusField` actions.
- **REQ6.3:** Activating outline entries or resource rows shall focus the underlying AST element or metadata field in the editor.

## Epic 7: Bibliography, references, and identity

- **REQ7.1:** Every section and element shall carry an immutable id used for labels, references, source maps, and sync.
- **REQ7.2:** The bibliography sidebar shall support adding, editing, and removing `references.bib` entries through BibLaTeX-oriented forms.
- **REQ7.3:** The application shall provide a searchable reference dialog to insert citations into body text or rich fields.
- **REQ7.4:** When configured, the application shall fetch bibliography metadata from a Zotero translation server when adding or editing entries.
- **REQ7.5:** The resources sidebar shall list document assets and generated elements with labels derived from captions or template defaults.

## Epic 8: Platform and localization

- **REQ8.1:** The application shall run as a Tauri v2 desktop app with a frameless window, native open/save dialogs, and filesystem IPC.
- **REQ8.2:** The application shall switch interface language between English and Spanish via Paraglide (`messages/{locale}.json`); all chrome strings shall use typed `m.*()` accessors.
- **REQ8.3:** Bundled templates shall ship `locales/{lang}.json` message maps; the editor shall translate field labels through `TemplateSpec.messages` with UI locale fallback.

## Epic 9: Architecture and quality (technical)

These requirements underpin the product but are not direct end-user features.

- **REQ9.1:** The UI shall use CSS Modules and design tokens only (no external UI framework); atomic components shall live under `src/components/atoms/` and compose into molecules, organisms, layout, and screens.
- **REQ9.2:** `DocumentSession` shall mirror the AST, track dirty fragments, assemble per-section `.typ` files, maintain source maps, and sync the in-memory VFS; React shall not generate Typst source.
- **REQ9.3:** `ergo-engine-wasm` shall compile from the mirrored VFS, retain `PagedDocument`, expose SVG page export, and run resource previews off the main thread.
- **REQ9.4:** `ts-rs` shall generate `src/bindings/` TypeScript types from Rust command DTOs; bindings shall not be hand-edited.
- **REQ9.5:** Rust shall own action ids, context expressions, catalog metadata, and keymap validation; React shall register contexts and handler chains.
- **REQ9.6:** The project shall maintain Vitest for frontend logic and `cargo nextest` for Rust (VFS patching, document session generation, template spec, settings, archive I/O). React component tests and Playwright E2E are outside the current test strategy.

## Exclusions (not required in the current release)

The following are explicitly out of scope:

- Online vs offline project modes (lightweight archive vs fully bundled dependencies toggle).
- Per-page or per-element export pickers beyond full-document export.
- User-defined manual labels on arbitrary text selections (only automatic element ids and template references).
- Math symbol autocomplete in the equation editor.
- In-app template authoring (templates are bundled JSON + Typst packages in the repo).
- Help menu documentation/about surfaces (menu entries exist as disabled placeholders).
- Cut/copy/paste menubar entries (clipboard works in editors; dedicated edit-menu actions are not wired).
