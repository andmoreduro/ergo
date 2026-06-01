use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::{
    AssetEntry, DocumentElement, EquationSyntax, ProjectSettings, ReferenceEntry, TableCell,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
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
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct FieldTextSegment {
    pub source_byte_start: usize,
    pub source_byte_end: usize,
    pub field_utf16_start: usize,
    pub field_utf16_end: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
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
#[ts(export)]
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
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSourceLayout {
    pub main_path: String,
    pub lib_path: String,
    pub section_paths: Vec<String>,
    pub references_path: String,
    pub source_map_path: String,
    pub field_source_map_path: String,
    pub document_state_path: String,
    pub project_settings_path: String,
    pub template_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSessionStatus {
    #[ts(type = "number")]
    pub source_revision: u64,
    pub layout: ProjectSourceLayout,
    pub source_map: Vec<SourceMapEntry>,
    pub field_source_map: Vec<FieldSourceMapEntry>,
    pub dirty_element_ids: Vec<String>,
    pub fragment_count: usize,
    pub dirty_resource_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DocumentEvent {
    SetProjectTitle {
        title: String,
    },
    SetProjectSettings {
        settings: ProjectSettings,
    },
    SetTemplateVariant {
        variant_id: String,
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
    UpdateParagraphContent {
        element_id: String,
        content: Vec<crate::ast::RichText>,
    },
    UpdateHeading {
        element_id: String,
        text: Option<String>,
        level: Option<i32>,
    },
    UpdateHeadingContent {
        element_id: String,
        content: Vec<crate::ast::RichText>,
        level: Option<i32>,
    },
    UpdateEquation {
        element_id: String,
        latex_source: Option<String>,
        is_block: Option<bool>,
        syntax: Option<EquationSyntax>,
    },
    UpdateTableCell {
        table_id: String,
        row_index: usize,
        col_index: usize,
        content: Vec<crate::ast::RichText>,
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
        asset_id: Option<String>,
    },
    UpdateInput {
        path: String,
        #[ts(type = "any")]
        value: serde_json::Value,
    },
    InsertInputArrayItem {
        path: String,
        index: usize,
        #[ts(type = "any")]
        value: serde_json::Value,
    },
    RemoveInputArrayItem {
        path: String,
        index: usize,
    },
    UpdateCustomElementField {
        element_id: String,
        field: String,
        #[ts(type = "any")]
        value: serde_json::Value,
    },
    UpdateElementExtraField {
        element_id: String,
        field_key: String,
        #[ts(type = "any")]
        field_value: serde_json::Value,
    },
    InsertReference {
        index: usize,
        reference: ReferenceEntry,
    },
    UpdateReference {
        reference: ReferenceEntry,
    },
    RemoveReference {
        reference_id: String,
    },
    RestoreReference {
        index: usize,
        reference: ReferenceEntry,
    },
    InsertAsset {
        index: usize,
        asset: AssetEntry,
    },
    UpdateAsset {
        asset: AssetEntry,
    },
    RemoveAsset {
        asset_id: String,
    },
    RestoreAsset {
        index: usize,
        asset: AssetEntry,
    },
}
