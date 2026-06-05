# Actor definition and user story map

Érgo is a single-user local desktop application. This document defines the primary actor and maps product capabilities across the author’s journey. Individual stories and requirements are listed in `user-stories.md` and `requirements.md`.

## Actor definition

* **Actor name:** The author / academic
* **Description:** A local user of the Érgo desktop app who creates projects, edits structured metadata and body content, manages bibliography and resources, previews compiled output, and exports finished documents. There are no multi-tenant roles, shared editing, or external workflow actors in v1.

## User story map

The horizontal axis is the chronological journey. Epic 9 (architecture and quality) underpins all phases but sits outside the journey spine.

```mermaid
flowchart LR
    Actor[Author]
    S0[Foundation]
    S1[Project setup]
    S2[Workspace]
    S3[Metadata and forms]
    S4[Body authoring]
    S5[Rich elements and refs]
    S6[Preview and sync]
    S7[Export]
    Actor --> S0
    S0 --> S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7
```

| Phase | Epics | Representative stories |
|-------|-------|------------------------|
| Foundation | Epic 9 | Design system, Rust Typst session, WASM preview, IPC bindings, action catalog |
| Project setup | Epics 1–2 | Create/open/close project, welcome screen, global and project settings, keymap |
| Workspace | Epics 3, 8 | Tri-column layout, sidebar, menubar, command palette, find/replace, localization |
| Metadata and forms | Epics 1, 4 | Template forms, variants/options, outline overrides, field types |
| Body authoring | Epics 3–4 | ProseMirror body, toolbar, paragraphs, headings, lists, quotes, diagrams |
| Rich elements and refs | Epics 4, 7 | Tables, figures, equations, bibliography, citations, resource catalog |
| Preview and sync | Epics 5–6 | Live preview, autosave, zoom, forward/backward preview sync |
| Export | Epics 1, 8 | PDF/PNG/SVG export, bibliography export, desktop platform |
