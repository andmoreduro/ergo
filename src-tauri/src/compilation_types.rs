use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub type SourceRevision = u64;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Pdf,
    Png,
    Svg,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CompilationJobKind {
    PreviewSvg,
    Export { format: ExportFormat },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum CompilationPriority {
    Preview,
    Export,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum CompilationStatus {
    Queued,
    Started,
    Succeeded,
    Failed,
    Dropped,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CompilationJob {
    #[ts(type = "number")]
    pub job_id: u64,
    pub kind: CompilationJobKind,
    pub priority: CompilationPriority,
    #[ts(type = "number")]
    pub source_revision: SourceRevision,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CompilationResult {
    #[ts(type = "number")]
    pub job_id: u64,
    pub kind: CompilationJobKind,
    #[ts(type = "number")]
    pub source_revision: SourceRevision,
    pub status: CompilationStatus,
    pub preview_pages: Option<Vec<PreviewPageFile>>,
    pub export_path: Option<String>,
    pub diagnostics: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct PreviewPageFile {
    pub page_number: usize,
    pub path: String,
    #[serde(default)]
    pub changed: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct CompilationQueueSnapshot {
    #[ts(type = "number")]
    pub latest_source_revision: SourceRevision,
    #[ts(type = "number | null")]
    pub active_job_id: Option<u64>,
    #[ts(type = "number | null")]
    pub queued_preview_job_id: Option<u64>,
    pub queued_export_count: usize,
    pub last_result: Option<CompilationResult>,
}
