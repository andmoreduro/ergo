# Context — design documentation index

Each file has one abstraction level. Use this index to find a topic without reading duplicate diagrams.

| Topic | Primary file | Diagram type |
|-------|----------------|--------------|
| Containers (Frontend, WASM, Backend, OS) | `component-diagram.md` | Component |
| Domain types and IPC DTOs | `class-diagrams.md` | Class |
| Source modules and dependencies | `package-diagrams.md` | Package |
| Time-ordered user flows | `sequence-diagrams.md` | Sequence |
| Object message graph (edit loop only) | `collaboration-diagrams.md` | Collaboration |
| Lifecycles and state machines | `state-diagrams.md` | State |
| Install layout, `.ergproj`, config paths | `distribution-diagram.md` | Distribution |
| Product requirements (imperative scope) | `requirements.md` | — |
| Product capability catalog and journey map | `user-stories.md`, `user-story-map.md` | — |

## Sequence diagram map (`sequence-diagrams.md`)

| § | Flow |
|---|------|
| 1 | Real-time edit, WASM compile, preview pages, backend mirror (includes undo/redo) |
| 2 | New project, `save_project`, autosave triggers |
| 3 | Open `.ergproj` and WASM bootstrap |
| 4 | Insert reference in editor |
| 5 | Export PDF/PNG/SVG via WASM |
| 6 | Keymap resolution |
| 7 | Preview ↔ editor sync (backward and forward) |

Save, export, open, and keymap are **not** in `collaboration-diagrams.md` (only the edit/preview collaboration graph lives there).

## Class diagram map (`class-diagrams.md`)

| § | Types |
|---|--------|
| 1 | `DocumentAST` root: metadata, references, assets |
| 2 | Sections and elements |
| 3 | Template specification (`TemplateSpec`, `EditorConfig`, `QuotePolicySpec`) |
| 4 | Actions and keymap |
| 5 | Backend `DocumentSession`, VFS, source maps |
| 6 | WASM `ErgoPreviewEngine`, `PreviewSyncState`, compile results |

## State diagram map (`state-diagrams.md`)

| § | Lifecycle |
|---|-----------|
| 1 | Frontend project UI (welcome → edit → save) |
| 2 | Backend `DocumentSession` mirror |
| 3 | WASM preview compile and `PreviewSyncState` |
| 4 | Preview page rendering |
| 5 | Key sequence resolver |

Preview sync resolve behavior is documented under state §3, not as a separate diagram.
