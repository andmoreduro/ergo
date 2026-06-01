# Class Diagrams

Domain models, backend structs, and IPC DTO shapes. Types that cross Tauri IPC are exported with `ts-rs` into `src/bindings/`. See `README.md` for the section index.

## Project Metadata, Settings, And Resources

```mermaid
classDiagram
    namespace Project_Document_Root {
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
            +String? theme_mode
            +String? locale
            +String[] recent_projects
            +Int? autosave_interval_ms
            +Boolean? autosave_enabled
            +Boolean? autosave_on_window_blur
            +Boolean? autosave_on_app_close
            +Boolean? autosave_on_project_close
        }

        class ProjectSettings {
            +String? paper_size
            +String? language
            +TemplateOverride[] template_overrides
        }

        class DependencyManifest {
            +Package[] packages
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
            +String? caption
        }
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
    namespace Document_Content_Model {
        class DocumentSection {
            <<abstract>>
            +String id
            +String type
            +Boolean is_optional
        }

        class ContentSection {
            +DocumentElement[] elements
        }

        class CoverPageSection {
            +Author[] authors
            +String[] affiliations
            +String abstract_text
        }

        class DocumentElement {
            <<abstract>>
            +String id
            +String type
        }

        class Heading {
            +Int level
            +RichText[] content
        }

        class Paragraph {
            +RichText[] content
        }

        class RichText {
            +String text
            +Boolean? bold
            +Boolean? italic
            +Boolean? underline
            +String? kind
            +String? reference_id
            +String? equation_source
            +EquationSyntax equation_syntax
        }

        class TableCell {
            +RichText[] content
            +Int? row_span
            +Int? col_span
        }

        class Table {
            +Int rows
            +Int cols
            +TableCell[][] cells
            +Map extra_fields
        }

        class Equation {
            +String latex_source
            +Boolean is_block
            +EquationSyntax syntax
        }

        class Figure {
            +String? asset_id
            +DocumentElement content
            +String caption
            +String placement
            +Map extra_fields
        }

        class Quote {
            +RichText[] content
        }

        class List {
            +RichText[][] items
        }

        class Enumeration {
            +RichText[][] items
        }

        class Diagram {
            +String mermaid_source
            +String? asset_id
            +String caption
            +String placement
            +Map extra_fields
        }
    }

    DocumentSection <|-- ContentSection
    DocumentSection <|-- CoverPageSection
    ContentSection "1" *-- "0..*" DocumentElement
    DocumentElement <|-- Heading
    DocumentElement <|-- Paragraph
    DocumentElement <|-- Quote
    DocumentElement <|-- List
    DocumentElement <|-- Enumeration
    DocumentElement <|-- Table
    DocumentElement <|-- Equation
    DocumentElement <|-- Figure
    DocumentElement <|-- Diagram
    Heading "1" *-- "0..*" RichText
    Paragraph "1" *-- "0..*" RichText
    Quote "1" *-- "0..*" RichText
    List "1" *-- "0..*" RichText
    Enumeration "1" *-- "0..*" RichText
```

`Figure`, `Diagram`, and `Table` store wrapper-specific named arguments in `extra_fields` (string keys → JSON values). The bundled template manifest (`template.json`) declares element overrides with a `wrapper` function name and `extra_fields` specs (`key`, `type`, `label`). `DocumentSession` emits those values as named arguments on the wrapper call; the element editor renders one control per spec. Standard Typst `#figure` keeps `caption` and `placement` on figure-like elements; custom wrappers use template-defined extras and omit placement when the wrapper is not `figure`. Each per-element `.typ` fragment that uses a custom wrapper imports that symbol from the template package at the top of the file, because `#include` runs in file-local scope. `Diagram` stores editable Mermaid source and references a durable generated SVG asset under `assets/diagrams/{diagram-id}.svg`.

## Action And Keymap Domain

```mermaid
classDiagram
    namespace Command_Action_Domain {
        class ActionId {
            <<enum>>
        }

        class ActionDescriptor {
            +ActionId id
            +String label_key
            +String category
            +String default_context
            +Boolean allows_keybinding
        }

        class ActionInvocation {
            +ActionId id
            +Json? payload
        }

        class ActionContextSnapshot {
            +String window_id
            +String? focused_context_id
            +ActionContextNode[] nodes
        }

        class ActionContextNode {
            +String id
            +String? parent_id
            +String[] contexts
        }

        class KeyBinding {
            +ActionId action_id
            +String context
            +KeyStroke[] sequence
        }

        class ActionResolution {
            <<enum>>
            NoMatch
            PendingSequence
            Matched
            Cancelled
        }
    }

    ActionDescriptor --> ActionId
    ActionInvocation --> ActionId
    ActionContextSnapshot "1" *-- "0..*" ActionContextNode
    KeyBinding --> ActionId
```

## Document Session And VFS

```mermaid
classDiagram
    namespace Document_Source {
        class TauriAppState {
            +Arc~VirtualFileSystem~ vfs
            +Arc~DocumentSession~ document_session
        }

        class DocumentSession {
            +sync_snapshot(ast: DocumentAST)
            +apply_event(event: DocumentEvent)
            +status() DocumentSessionStatus
        }

        class DocumentSessionStatus {
            +UInt64 source_revision
            +ProjectSourceLayout layout
            +SourceMapEntry[] source_map
            +FieldSourceMapEntry[] field_source_map
            +String[] dirty_section_ids
            +String[] dirty_element_ids
        }

        class DocumentEvent {
            <<enum>>
        }

        class GeneratedFragment {
            +String element_id
            +String section_id
            +String source
            +UInt64 source_hash
            +SourceMapEntry[] source_map_ranges
            +FieldSourceMapEntry[] field_source_map_ranges
        }

        class SourceMapEntry {
            +String element_id
            +String field_id
            +String file_path
            +Int byte_start
            +Int byte_end
        }

        class FieldSourceMapEntry {
            +String element_id
            +String field_id
            +String file_path
            +FieldTextSegment[] segments
        }

        class VirtualFileSystem {
            +write_source(path, text)
            +write_file(path, bytes)
            +read_typst_source(path)
            +latest_revision()
            +get_all_files()
        }
    }

    TauriAppState *-- VirtualFileSystem
    TauriAppState *-- DocumentSession
    DocumentSession o-- VirtualFileSystem
    DocumentSession *-- GeneratedFragment
    DocumentSessionStatus *-- SourceMapEntry
    DocumentSessionStatus *-- FieldSourceMapEntry
    DocumentEvent ..> DocumentAST
```

## WASM Preview Engine

```mermaid
classDiagram
    namespace Wasm_Preview {
        class ErgoPreviewEngine {
            +sync_snapshot(ast)
            +sync_events(events)
            +compile_preview()
            +render_page(pageIndex, pixelPerPt)
            +render_svg_page(pageIndex)
            +render_resource_svg_page(pageNumber)
            +jump_from_click(page, x_pt, y_pt, revision)
            +positions_for_focus(target, revision)
            +export_pdf()
            +export_all_png(pixelPerPt)
            +export_all_svg()
        }

        class PreviewSyncState {
            +store_preview(document, maps, revision)
            +jump_from_click(...)
            +positions_for_focus(...)
        }

        class CompilationResult {
            +UInt64 source_revision
            +CompilationStatus status
            +PreviewPageFile[] preview_pages
            +DocumentOutline? outline
            +DocumentResources? resources
            +String[] diagnostics
        }

        class PreviewPageFile {
            +Int page_number
            +String path
            +Boolean changed
        }

        class ErgoWorld {
            +Source source(id)
            +Bytes file(id)
        }

        class PreviewFocusTarget {
            +String element_id
            +String? field_id
            +Int? caret_utf16_offset
            +UInt64 source_revision
        }

        class RetainedPreviewDocument {
            +UInt64 source_revision
            +PagedDocument document
            +SourceMapEntry[] source_map
            +FieldSourceMapEntry[] field_source_map
        }
    }

    ErgoPreviewEngine *-- DocumentSession
    ErgoPreviewEngine *-- PreviewSyncState
    ErgoPreviewEngine o-- ErgoWorld : preview_world
    ErgoPreviewEngine o-- ErgoWorld : resource_world
    ErgoPreviewEngine ..> CompilationResult : produces
    PreviewSyncState *-- RetainedPreviewDocument
    ErgoWorld o-- VirtualFileSystem
```

## Model Notes

- Frontend `DocumentContext` holds `local_ast`, queued `DocumentEvent`s, undo entries `{ forward_event, inverse_event }`, `DocumentFocusState`, and the action context tree; it applies the same event shape for live edits, undo, redo, worker sync, and backend mirror sync.
- `DocumentEvent` variants are defined in `document_session_types` and exported to TypeScript; the diagram omits the full enum list.
- `GeneratedFragment` is an in-memory cache entry, not a persisted archive file.
- `FieldSourceMapEntry` maps Typst byte ranges to editor field IDs with UTF-16 segments for browser selection APIs.
- `PreviewPageFile.path` is a logical page id (`page-N`) for preview rendering, not a VFS SVG artifact in the preview path.
- `PreviewSyncState` is runtime-only WASM state tied to the last successful non-stale compile.
- `SourceMapEntry` byte ranges are half-open: `byte_start` inclusive, `byte_end` exclusive.
- Module ownership and dependency direction are documented in `package-diagrams.md`.
