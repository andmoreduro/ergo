# Class Diagrams

Domain models, backend structs, and IPC DTO shapes. Types that cross Tauri IPC are exported with `ts-rs` into `src/bindings/`. See `README.md` for the section index.

## Project Metadata, Settings, And Resources

```mermaid
classDiagram
    class DocumentAST {
        +String version
        +ProjectMetadata metadata
        +DependencyManifest dependencies
        +ReferenceEntry[] references
        +AssetEntry[] assets
        +DocumentSection[] sections
    }
    class ProjectMetadata {
        +String template_id
        +String? template_variant_id
        +String title
        +ProjectSettings project_settings
        +GlobalSettings local_overrides
    }
    class GlobalSettings {
        +String? locale
        +Int? autosave_interval_ms
        +Boolean? autosave_enabled
    }
    class ProjectSettings {
        +String? paper_size
        +String? language
        +TemplateOverride[] template_overrides
    }
    class ReferenceEntry {
        +String id
        +String citation_key
        +String biblatex
    }
    class AssetEntry {
        +String id
        +String path
        +String kind
    }
    class DependencyManifest {
        +Package[] packages
    }
    DocumentAST "1" *-- "1" ProjectMetadata
    DocumentAST "1" *-- "1" DependencyManifest
    DocumentAST "1" *-- "0..*" ReferenceEntry
    DocumentAST "1" *-- "0..*" AssetEntry
    DocumentAST "1" *-- "1..*" DocumentSection
```

## Document Sections And Elements

```mermaid
classDiagram
    class DocumentSection {
        <<abstract>>
        +String id
        +String type
    }
    class ContentSection {
        +DocumentElement[] elements
    }
    class CoverPageSection {
        +Author[] authors
        +String abstract_text
    }
    class DocumentElement {
        <<abstract>>
        +String id
        +String type
    }
    class RichText {
        +String text
        +String? kind
        +String? reference_id
    }
    class Table {
        +Int rows
        +Int cols
        +TableCell[][] cells
    }
    class Equation {
        +String latex_source
        +Boolean is_block
        +EquationSyntax syntax
    }
    class Figure {
        +String? asset_id
        +String caption
    }
    class Diagram {
        +String mermaid_source
        +String? asset_id
    }
    DocumentSection <|-- ContentSection
    DocumentSection <|-- CoverPageSection
    ContentSection "1" *-- "0..*" DocumentElement
    DocumentElement <|-- Heading
    DocumentElement <|-- Paragraph
    DocumentElement <|-- Quote
    DocumentElement <|-- List
    DocumentElement <|-- Table
    DocumentElement <|-- Equation
    DocumentElement <|-- Figure
    DocumentElement <|-- Diagram
```

## Template Specification

Bundled and custom templates ship a `template.json` manifest deserialized as `TemplateSpec`. The frontend loads it through `get_template_spec`; the backend uses it for Typst section assembly, element overrides, and editor input schemas.

```mermaid
classDiagram
    class TemplateSpec {
        +TemplateMetadata metadata
        +TypstConfig typst
        +EditorConfig editor
        +Map messages
    }
    class TypstConfig {
        +PackageSpec package
        +SectionSpec[] sections
        +ElementOverrides? element_overrides
    }
    class EditorConfig {
        +InputSchema[] inputs
        +InputGroupSpec[] groups
        +TemplateVariantSpec[] variants
        +QuotePolicySpec? quote_policy
        +TemplateOptionSpec[] options
    }
    TemplateSpec "1" *-- "1" TypstConfig
    TemplateSpec "1" *-- "1" EditorConfig
```

## Action And Keymap Domain

```mermaid
classDiagram
    class ActionDescriptor {
        +ActionId id
        +String label_key
        +String default_context
        +Boolean allows_keybinding
    }
    class KeymapSettings {
        +String active_profile_id
        +KeymapProfileRecord[] profiles
        +KeyBinding[] keymap_bindings
    }
    class ActionInvocation {
        +ActionId id
        +Json? payload
    }
    class ActionContextSnapshot {
        +String window_id
        +ActionContextNode[] nodes
    }
    class KeyBinding {
        +ActionId action_id
        +String context
        +KeyStroke[] sequence
    }
    KeymapSettings "1" *-- "0..*" KeyBinding
    ActionInvocation --> ActionId
    KeyBinding --> ActionId
```

## Document Session And VFS

```mermaid
classDiagram
    class DocumentSession {
        +sync_snapshot(ast)
        +apply_event(event)
        +status() DocumentSessionStatus
    }
    class DocumentSessionStatus {
        +UInt64 source_revision
        +SourceMapEntry[] source_map
        +FieldSourceMapEntry[] field_source_map
    }
    class SourceMapEntry {
        +String element_id
        +String field_id
        +String file_path
        +Int byte_start
        +Int byte_end
    }
    class VirtualFileSystem {
        +write_source(path, text)
        +write_file(path, bytes)
        +read_typst_source(path)
    }
    DocumentSession o-- VirtualFileSystem
    DocumentSessionStatus *-- SourceMapEntry
    DocumentSessionStatus *-- FieldSourceMapEntry
```

## WASM Preview Engine

```mermaid
classDiagram
    class ErgoPreviewEngine {
        +sync_snapshot(ast)
        +sync_events(events)
        +compile_preview()
        +render_svg_page(pageIndex)
        +jump_from_click(...)
        +export_pdf()
    }
    class PreviewSyncState {
        +store_preview(...)
        +jump_from_click(...)
    }
    class CompilationResult {
        +UInt64 source_revision
        +PreviewPageFile[] preview_pages
        +DocumentOutline? outline
        +DocumentResources? resources
    }
    class PreviewFocusTarget {
        +String element_id
        +String? field_id
        +UInt64 source_revision
    }
    ErgoPreviewEngine *-- DocumentSession
    ErgoPreviewEngine *-- PreviewSyncState
    ErgoPreviewEngine ..> CompilationResult
```

## Model Notes

- Frontend `DocumentContext` holds `local_ast`, queued `DocumentEvent`s, undo entries `{ forward_event, inverse_event }`, `DocumentFocusState`, and the action context tree. All committed AST mutations apply `DocumentEvent`s via `applyDocumentEvents` (body commits events directly; `dispatch(ASTAction)` derives events then commits the same `COMMIT_EVENTS` path). Undo, redo, worker sync, and backend mirror use the same event shape.
- `DocumentEvent` variants are defined in `document_session_types` and exported to TypeScript; class diagrams omit the full enum list.
- `RichText.kind` distinguishes inline embeds: `"reference"` (uses `reference_id`) and `"inlineEquation"` (uses `equation_source` and `equation_syntax`). Plain prose uses `kind: null`.
- `Figure`, `Diagram`, and `Table` elements emit inside a float wrapper Typst call. `ElementOverrides` may name a template-package wrapper function. Front-matter `#outline()` / `#pagebreak()` blocks are generated from `ProjectSettings.template_overrides`. `Diagram` stores Mermaid source and references a generated SVG under `assets/diagrams/{diagram-id}.svg`.
- Project settings store template option values in `ProjectSettings.template_overrides` under keys `option.{id}`. `QuotePolicySpec` is serialized as a word threshold or `"block"` / `"inline"`; paragraph split/reconcile helpers exist in `quotePolicy.ts` but are not connected to the live editor.
- `GeneratedFragment` is an in-memory cache entry, not a persisted archive file.
- `FieldSourceMapEntry` maps Typst byte ranges to editor field IDs with UTF-16 segments for browser selection APIs.
- `PreviewPageFile.path` is a logical page id (`page-N`) for preview rendering, not a VFS SVG artifact.
- `PreviewSyncState` is runtime-only WASM state tied to the last successful non-stale compile.
- `SourceMapEntry` byte ranges are half-open: `byte_start` inclusive, `byte_end` exclusive.
- Module ownership and dependency direction: `package-diagrams.md`. Preview and sync flows: `sequence-diagrams.md` §1 and §7.
