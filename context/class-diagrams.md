# Class Diagrams

This document describes the core domain models and backend structs that define Érgo's architecture. Rust structs that cross the Tauri IPC boundary must be exported to TypeScript with `ts-rs`.

The diagrams are split by responsibility so each view answers one question without requiring the full system to fit in a single graph.

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
            +String title
            +ProjectSettings project_settings
            +GlobalSettings local_overrides
        }

        class GlobalSettings {
            +String? theme_mode
            +String? locale
            +String[] recent_projects
            +Boolean? preview_debounce_enabled
            +Int? preview_debounce_ms
            +Int? history_limit
            +Boolean? autosave_enabled
            +Int? autosave_interval_ms
            +Boolean? autosave_on_window_blur
            +Boolean? autosave_on_app_close
            +Boolean? autosave_on_project_close
        }

        class ProjectSettings {
            +String? paper_size
            +String? language
            +String? text_font
            +String? math_font
            +String? raw_font
            +Float? font_size
            +Float? table_stroke_width
            +TemplateOverride[] template_overrides
        }

        class TemplateOverride {
            +String key
            +String value
        }

        class DependencyManifest {
            +Package[] packages
        }

        class Package {
            +String namespace
            +String name
            +String version
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
    ProjectMetadata "1" *-- "1" ProjectSettings
    ProjectMetadata "1" *-- "1" GlobalSettings
    ProjectSettings "1" *-- "0..*" TemplateOverride
    DependencyManifest "1" *-- "0..*" Package
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

        class Author {
            +String name
            +String? email
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
            +String? kind
            +String? reference_id
            +String? equation_source
        }

        class Table {
            +Int rows
            +Int cols
            +TableCell[][] cells
            +String[] column_sizes
        }

        class TableCell {
            +String content
            +Int? row_span
            +Int? col_span
        }

        class Equation {
            +String latex_source
            +Boolean is_block
        }

        class Figure {
            +String? asset_id
            +DocumentElement content
            +String caption
            +String placement
        }
    }

    DocumentSection <|-- ContentSection
    DocumentSection <|-- CoverPageSection
    CoverPageSection "1" *-- "0..*" Author
    ContentSection "1" *-- "0..*" DocumentElement
    DocumentElement <|-- Heading
    DocumentElement <|-- Paragraph
    DocumentElement <|-- Table
    DocumentElement <|-- Equation
    DocumentElement <|-- Figure
    Heading "1" *-- "0..*" RichText
    Paragraph "1" *-- "0..*" RichText
    Table "1" *-- "0..*" TableCell
    Figure "1" *-- "1" DocumentElement
```

## Action And Keymap Domain

```mermaid
classDiagram
    namespace Command_Action_Domain {
        class ActionId {
            <<enum>>
            workspace::OpenProject
            editor::InsertParagraph
            view::OpenCommandPalette
        }

        class ActionDescriptor {
            +ActionId id
            +String label_key
            +String category
            +String default_context
            +Boolean allows_keybinding
            +Boolean requires_project
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
            +Map~String,String~ attributes
        }

        class ContextExpression {
            +String expression
            +matches(snapshot) Boolean
            +specificity() Int
        }

        class LogicalKeyEvent {
            +String window_id
            +String key
            +KeyModifier[] modifiers
        }

        class KeyStroke {
            +String key
            +KeyModifier[] modifiers
        }

        class KeyModifier {
            <<enum>>
            Control
            Alt
            Shift
            Meta
        }

        class KeyBinding {
            +ActionId action_id
            +String context
            +KeyStroke[] sequence
        }

        class KeyBindingPreference {
            +ActionId action_id
            +String context
            +KeyStroke[] sequence
        }

        class KeymapProfile {
            +String name
            +KeyBinding[] bindings
        }

        class KeymapSettings {
            +String? keymap_profile
            +KeyBindingPreference[] keymap_bindings
            +KeyBindingPreference[] keymap_overrides
        }

        class ActionResolution {
            <<enum>>
            NoMatch
            PendingSequence
            Matched
            Cancelled
        }
    }

    ActionDescriptor "1" --> "1" ActionId
    ActionInvocation "1" --> "1" ActionId
    ActionContextSnapshot "1" *-- "0..*" ActionContextNode
    LogicalKeyEvent "1" *-- "0..*" KeyModifier
    KeyStroke "1" *-- "0..*" KeyModifier
    KeyBinding "1" --> "1" ActionId
    KeyBinding "1" --> "1" ContextExpression
    KeyBinding "1" *-- "1..*" KeyStroke
    KeyBindingPreference "1" --> "1" ActionId
    KeyBindingPreference "1" *-- "0..*" KeyStroke
    KeymapProfile "1" *-- "0..*" KeyBinding
    KeymapSettings "1" *-- "0..*" KeyBindingPreference
```

## Document Session, Source Maps, And VFS

```mermaid
classDiagram
    namespace Backend_Document_Source {
        class TauriAppState {
            +Arc~VirtualFileSystem~ vfs
            +Arc~CompilationQueue~ compilation_queue
            +Arc~DocumentSession~ document_session
            +Arc~PreviewSyncState~ preview_sync
        }

        class DocumentSession {
            +sync_snapshot(ast: DocumentAST) Result~DocumentSessionStatus~
            +apply_event(event: DocumentEvent) Result~DocumentSessionStatus~
            +status() DocumentSessionStatus
        }

        class DocumentSessionStatus {
            +UInt64 source_revision
            +ProjectSourceLayout layout
            +SourceMapEntry[] source_map
            +FieldSourceMapEntry[] field_source_map
            +String[] dirty_section_ids
            +String[] dirty_element_ids
            +Int fragment_count
        }

        class DocumentEvent {
            <<enum>>
            SetProjectTitle
            SetProjectSettings
            UpdateCoverAbstract
            UpdateCoverAffiliations
            InsertAuthor
            UpdateAuthor
            RemoveAuthor
            RestoreAuthor
            InsertElement
            RemoveElement
            RestoreElement
            UpdateParagraphText
            UpdateHeading
            UpdateEquation
            UpdateTableCell
            InsertTableRow
            RemoveTableRow
            RestoreTableRow
            InsertTableColumn
            RemoveTableColumn
            RestoreTableColumn
            UpdateTableColumnSize
            UpdateFigure
        }

        class GeneratedFragment {
            +String element_id
            +String section_id
            +String kind
            +String source
            +UInt64 source_hash
            +String[] dependencies
            +SourceMapEntry[] source_map_ranges
            +FieldSourceMapEntry[] field_source_map_ranges
        }

        class SectionSource {
            +String section_id
            +String file_path
            +String source
            +String[] fragment_ids
            +UInt64 revision
        }

        class SourceMapEntry {
            +String element_id
            +String section_id
            +String file_path
            +Int start
            +Int end
            +Int byte_start
            +Int byte_end
            +String label
            +Int? page
        }

        class FieldTextSegment {
            +Int source_byte_start
            +Int source_byte_end
            +Int field_utf16_start
            +Int field_utf16_end
        }

        class FieldSourceMapEntry {
            +String element_id
            +String section_id
            +String field_id
            +String file_path
            +Int byte_start
            +Int byte_end
            +FieldTextSegment[] segments
            +Int? fallback_caret_utf16_offset
        }

        class ProjectSourceLayout {
            +String main_path
            +String[] section_paths
            +String references_path
            +String source_map_path
            +String field_source_map_path
            +String document_state_path
            +String project_settings_path
            +String template_path
        }

        class VirtualFileSystem {
            +HashMap~String, VirtualTextFile~ memory_sources
            +HashMap~String, Bytes~ memory_files
            +read_source(path: String) Result~String~
            +read_typst_source(path: String) Result~Source~
            +write_source(path: String, text: String) UInt64
            +apply_patch(path: String, start: Int, end: Int, text: String)
            +read_file(path: String) Result~Bytes~
            +write_file(path: String, bytes: Bytes)
            +latest_revision() UInt64
            +get_all_files() HashMap~String, Bytes~
        }

        class VirtualTextFile {
            +String path
            +String text
            +UInt64 revision
            +UInt64 last_modified
        }

        class RetainedTextFile {
            +Source source
            +UInt64 revision
            +UInt64 last_modified
        }
    }

    TauriAppState "1" *-- "1" VirtualFileSystem
    TauriAppState "1" *-- "1" DocumentSession
    DocumentSession "1" o-- "1" VirtualFileSystem
    DocumentSession "1" *-- "0..*" GeneratedFragment
    DocumentSession "1" *-- "0..*" SectionSource
    DocumentSessionStatus "1" *-- "1" ProjectSourceLayout
    DocumentSessionStatus "1" *-- "0..*" SourceMapEntry
    DocumentSessionStatus "1" *-- "0..*" FieldSourceMapEntry
    DocumentEvent ..> DocumentAST
    SectionSource "1" *-- "0..*" GeneratedFragment
    GeneratedFragment "1" *-- "0..*" SourceMapEntry
    GeneratedFragment "1" *-- "0..*" FieldSourceMapEntry
    FieldSourceMapEntry "1" *-- "0..*" FieldTextSegment
    VirtualFileSystem "1" *-- "0..*" RetainedTextFile
    VirtualFileSystem "1" *-- "0..*" VirtualTextFile
```

## Compilation Queue

```mermaid
classDiagram
    namespace Backend_Compile_Queue {
        class CompilationQueue {
            +enqueue_preview(source_revision: UInt64) CompilationJob
            +enqueue_export(format: ExportFormat) CompilationJob
            +mark_source_revision(source_revision: UInt64)
            +snapshot() CompilationQueueSnapshot
        }

        class CompilationQueueSnapshot {
            +UInt64 latest_source_revision
            +UInt64? active_job_id
            +UInt64? queued_preview_job_id
            +Int queued_export_count
            +CompilationResult? last_result
        }

        class CompilationJob {
            +UInt64 job_id
            +CompilationJobKind kind
            +CompilationPriority priority
            +UInt64 source_revision
        }

        class CompilationJobKind {
            <<enum>>
            PreviewSvg
            Export
        }

        class CompilationPriority {
            <<enum>>
            Preview
            Export
        }

        class CompilationStatus {
            <<enum>>
            Queued
            Started
            Succeeded
            Failed
            Dropped
        }

        class ExportFormat {
            <<enum>>
            Svg
            Pdf
            Png
        }

        class CompilationResult {
            +UInt64 job_id
            +CompilationJobKind kind
            +UInt64 source_revision
            +CompilationStatus status
            +PreviewPageFile[]? preview_pages
            +String? export_path
            +String[] diagnostics
        }

        class PreviewPageFile {
            +Int page_number
            +String path
            +Boolean changed
        }

        class ErgoWorld {
            +Arc~VirtualFileSystem~ vfs
            +FileId main
            +Source source(id: FileId)
            +Bytes file(id: FileId)
            +Font font(index: Int)
            +World upcast()
        }
    }

    TauriAppState "1" *-- "1" CompilationQueue
    CompilationQueue "1" *-- "0..*" CompilationJob
    CompilationQueue "1" --> "1" CompilationQueueSnapshot
    CompilationQueue ..> ErgoWorld : compiles with
    CompilationJob "1" --> "1" CompilationJobKind
    CompilationJob "1" --> "1" CompilationPriority
    CompilationResult "1" --> "1" CompilationStatus
    CompilationResult "1" --> "1" CompilationJobKind
    CompilationResult "1" *-- "0..*" PreviewPageFile
    CompilationQueueSnapshot "1" --> "0..1" CompilationResult
    ErgoWorld "1" o-- "1" VirtualFileSystem
```

## Preview Sync

```mermaid
classDiagram
    namespace Backend_Preview_Sync {
        class PreviewSyncState {
            +store_preview(source_revision: UInt64, document: PagedDocument, source_map: SourceMapEntry[], field_source_map: FieldSourceMapEntry[])
            +jump_from_click(page: Int, x_pt: Float, y_pt: Float, revision: UInt64) PreviewJumpResult
            +positions_for_element(element_id: String, revision: UInt64) PreviewElementPositionsResult
            +positions_for_focus(target: PreviewFocusTarget, revision: UInt64) PreviewElementPositionsResult
            +status() PreviewSyncStatus
        }

        class RetainedPreviewDocument {
            +UInt64 source_revision
            +PagedDocument document
            +SourceMapEntry[] source_map
            +FieldSourceMapEntry[] field_source_map
            +PreviewPageMetrics[] pages
        }

        class PreviewPageMetrics {
            +Int page_number
            +Float width_pt
            +Float height_pt
        }

        class PreviewElementPosition {
            +String? element_id
            +String? field_id
            +Int? caret_utf16_offset
            +Int page_number
            +Float x_pt
            +Float y_pt
            +UInt64 source_revision
        }

        class PreviewFocusTarget {
            +String element_id
            +String? field_id
            +Int? caret_utf16_offset
            +UInt64 source_revision
        }

        class PreviewJumpResult {
            <<enum>>
            Field
            Element
            Position
            NoMatch
            Unavailable
        }

        class PreviewElementPositionsResult {
            <<enum>>
            Matched
            NoMatch
            Unavailable
        }

        class PreviewSyncStatus {
            +UInt64? source_revision
            +PreviewPageMetrics[] pages
        }

        class ErgoWorld {
            +Arc~VirtualFileSystem~ vfs
            +FileId main
            +Source source(id: FileId)
            +Bytes file(id: FileId)
            +Font font(index: Int)
            +World upcast()
        }
    }

    TauriAppState "1" *-- "1" PreviewSyncState
    CompilationQueue --> PreviewSyncState : stores successful preview
    PreviewSyncState "1" *-- "0..1" RetainedPreviewDocument
    PreviewSyncState "1" --> "1" PreviewSyncStatus
    RetainedPreviewDocument "1" *-- "0..*" PreviewPageMetrics
    RetainedPreviewDocument "1" *-- "0..*" SourceMapEntry
    RetainedPreviewDocument "1" *-- "0..*" FieldSourceMapEntry
    PreviewElementPosition "1" --> "1" PreviewPageMetrics
    PreviewSyncState ..> ErgoWorld : resolves jumps with
    ErgoWorld "1" o-- "1" VirtualFileSystem
```

## Cross-Domain Ownership

```mermaid
classDiagram
    class ReactRuntime {
        +ActionContextNode[] context_tree
        +DocumentAST local_ast
        +DocumentEventHistoryEntry[] undo_history
        +QueuedDocumentEvent[] pending_events
        +DocumentFocusState focus_state
        +dispatch(action: ActionInvocation)
    }

    class DocumentEventHistoryEntry {
        +DocumentEvent forward_event
        +DocumentEvent inverse_event
        +DocumentAST previous_ast
        +DocumentAST next_ast
    }

    class QueuedDocumentEvent {
        +UInt64 id
        +DocumentEvent event
        +UInt64 timestamp
    }

    class TauriAppState {
        +Arc~VirtualFileSystem~ vfs
        +Arc~CompilationQueue~ compilation_queue
        +Arc~DocumentSession~ document_session
        +Arc~PreviewSyncState~ preview_sync
    }

    class DocumentAST
    class DocumentEvent
    class ActionInvocation
    class ActionContextNode
    class DocumentSession
    class CompilationQueue
    class PreviewSyncState
    class VirtualFileSystem

    ReactRuntime "1" *-- "1" DocumentAST
    ReactRuntime "1" *-- "0..*" DocumentEventHistoryEntry
    ReactRuntime "1" *-- "0..*" QueuedDocumentEvent
    DocumentEventHistoryEntry "1" *-- "1" DocumentEvent
    QueuedDocumentEvent "1" *-- "1" DocumentEvent
    ReactRuntime "1" *-- "0..*" ActionContextNode
    ReactRuntime ..> ActionInvocation : dispatches
    ReactRuntime ..> TauriAppState : invokes commands
    TauriAppState "1" *-- "1" DocumentSession
    TauriAppState "1" *-- "1" CompilationQueue
    TauriAppState "1" *-- "1" PreviewSyncState
    TauriAppState "1" *-- "1" VirtualFileSystem
```

## Model Notes

- Frontend document elements do not generate Typst source directly as the canonical path. Rust `DocumentSession` owns canonical source materialization.
- `main.typ` is generated as a small entry point. Each enabled document section is generated as `sections/{section-id}.typ`.
- `GeneratedFragment` is an internal cache record for one element or section-level fragment. It supports dirty detection and source-map generation but is not persisted as a separate file in v1.
- `FieldSourceMapEntry` maps generated Typst byte ranges back to editor field IDs. Plain text segments track UTF-16 offsets because browser text selection APIs use UTF-16 code units.
- `RetainedTextFile.source` represents a retained Typst `Source`. The public `VirtualTextFile` status type exposes text and revision metadata, not the internal Typst source object. Generated preview SVGs are stored as VFS file bytes, not retained text sources.
- VFS edits should update retained sources with `Source::replace` or `Source::edit` to benefit from Typst incremental parsing.
- `CompilationResult.preview_pages` is the preview contract. Each preview page reports whether its SVG file changed.
- `PreviewSyncState` keeps only runtime sync data. It is not persisted inside `.ergproj` archives.
- The retained preview keeps the compiled `PagedDocument`, element source-map snapshot, field source-map snapshot, Typst source snapshot, source revision, and page metrics together.
- Preview sync returns `Unavailable` when the requested revision is not the retained preview revision.
- `SourceMapEntry` byte ranges use half-open ownership: `byte_start` is included and `byte_end` is excluded. Adjacent generated fragments must not both claim the same boundary byte.
- Backward sync maps `typst_ide::Jump::File` offsets to field ranges first and element ranges second. Forward sync maps `PreviewFocusTarget` values to Typst preview positions with `jump_from_cursor`.
- Keymap preference files use typed `action_id` values such as `workspace::OpenProject`, a context expression such as `editor && !input`, and a logical-key `sequence` array. The persisted keymap schema is strict.
- React owns `ActionContextNode` registration and action handlers. Rust owns `ActionDescriptor`, keymap validation, context-expression matching, sequence state, and `ActionResolution`.
- Public IPC DTOs that cross the Tauri boundary are exported with `ts-rs` into `src/bindings/`; frontend code must import those generated types directly. Local Rust `u64` counters and revisions are exported as TypeScript `number` values under the assumption that session-local monotonic counters remain far below `Number.MAX_SAFE_INTEGER`.
- Backend coupling boundaries are module-level. The package diagram is the canonical place for source-module ownership and dependency rules.
