use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::document_outline::DocumentOutline;
use crate::document_resources::DocumentResources;

pub type SourceRevision = u64;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Pdf,
    Png,
    Svg,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum CompilationStatus {
    Started,
    Succeeded,
    Failed,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
pub struct CompilationResult {
    #[ts(type = "number")]
    pub source_revision: SourceRevision,
    pub status: CompilationStatus,
    pub preview_pages: Option<Vec<PreviewPageFile>>,
    pub export_path: Option<String>,
    pub diagnostics: Vec<String>,
    pub outline: Option<DocumentOutline>,
    pub resources: Option<DocumentResources>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../../src/bindings/")]
pub struct PreviewPageFile {
    pub page_number: usize,
    pub path: String,
    #[serde(default)]
    pub changed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}
