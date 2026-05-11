use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::{Author, DocumentElement, ProjectSettings, TableCell};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct SourceMapEntry {
    pub element_id: String,
    pub section_id: String,
    pub file_path: String,
    pub start: usize,
    pub end: usize,
    pub byte_start: usize,
    pub byte_end: usize,
    pub label: String,
    #[serde(default)]
    pub page: Option<usize>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct FieldTextSegment {
    pub source_byte_start: usize,
    pub source_byte_end: usize,
    pub field_utf16_start: usize,
    pub field_utf16_end: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct FieldSourceMapEntry {
    pub element_id: String,
    pub section_id: String,
    pub field_id: String,
    pub file_path: String,
    pub byte_start: usize,
    pub byte_end: usize,
    pub segments: Vec<FieldTextSegment>,
    #[serde(default)]
    pub fallback_caret_utf16_offset: Option<usize>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFragment {
    pub element_id: String,
    pub section_id: String,
    pub kind: String,
    pub source: String,
    #[ts(type = "number")]
    pub source_hash: u64,
    pub dependencies: Vec<String>,
    pub source_map_ranges: Vec<SourceMapEntry>,
    pub field_source_map_ranges: Vec<FieldSourceMapEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct SectionSource {
    pub section_id: String,
    pub file_path: String,
    pub source: String,
    pub fragment_ids: Vec<String>,
    #[ts(type = "number")]
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct ProjectSourceLayout {
    pub main_path: String,
    pub section_paths: Vec<String>,
    pub references_path: String,
    pub source_map_path: String,
    pub field_source_map_path: String,
    pub document_state_path: String,
    pub project_settings_path: String,
    pub template_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct DocumentSessionStatus {
    #[ts(type = "number")]
    pub source_revision: u64,
    pub layout: ProjectSourceLayout,
    pub source_map: Vec<SourceMapEntry>,
    pub field_source_map: Vec<FieldSourceMapEntry>,
    pub dirty_section_ids: Vec<String>,
    pub dirty_element_ids: Vec<String>,
    pub fragment_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DocumentEvent {
    SetProjectTitle {
        title: String,
    },
    SetProjectSettings {
        settings: ProjectSettings,
    },
    UpdateCoverAbstract {
        section_id: String,
        text: String,
    },
    UpdateCoverAffiliations {
        section_id: String,
        affiliations: Vec<String>,
    },
    InsertAuthor {
        section_id: String,
        index: usize,
        author: Author,
    },
    UpdateAuthor {
        section_id: String,
        author_index: usize,
        field: AuthorField,
        value: String,
    },
    RemoveAuthor {
        section_id: String,
        author_index: usize,
    },
    RestoreAuthor {
        section_id: String,
        author_index: usize,
        author: Author,
    },
    InsertElement {
        section_id: String,
        index: usize,
        element: Box<DocumentElement>,
    },
    RemoveElement {
        element_id: String,
    },
    RestoreElement {
        section_id: String,
        index: usize,
        element: Box<DocumentElement>,
    },
    UpdateParagraphText {
        element_id: String,
        text: String,
    },
    UpdateHeading {
        element_id: String,
        text: Option<String>,
        level: Option<i32>,
    },
    UpdateEquation {
        element_id: String,
        latex_source: Option<String>,
        is_block: Option<bool>,
    },
    UpdateTableCell {
        table_id: String,
        row_index: usize,
        col_index: usize,
        text: String,
    },
    InsertTableRow {
        table_id: String,
        row_index: usize,
        cells: Vec<TableCell>,
    },
    RemoveTableRow {
        table_id: String,
        row_index: usize,
    },
    RestoreTableRow {
        table_id: String,
        row_index: usize,
        cells: Vec<TableCell>,
    },
    InsertTableColumn {
        table_id: String,
        col_index: usize,
        cells: Vec<TableCell>,
        size: String,
    },
    RemoveTableColumn {
        table_id: String,
        col_index: usize,
    },
    RestoreTableColumn {
        table_id: String,
        col_index: usize,
        cells: Vec<TableCell>,
        size: String,
    },
    UpdateTableColumnSize {
        table_id: String,
        col_index: usize,
        size: String,
    },
    UpdateFigure {
        element_id: String,
        caption: Option<String>,
        placement: Option<String>,
        body_text: Option<String>,
    },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum AuthorField {
    Name,
    Email,
}
