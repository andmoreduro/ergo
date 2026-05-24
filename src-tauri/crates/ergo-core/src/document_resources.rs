use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::DocumentAST;
use crate::template_spec::TemplateSpec;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum ResourceKind {
    File,
    Figure,
    Table,
    Equation,
    Custom,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub enum ResourcePreviewStatus {
    Ready,
    Failed,
    Missing,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ResourcePreview {
    pub status: ResourcePreviewStatus,
    pub path: Option<String>,
    pub diagnostic: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ResourceEntry {
    pub id: String,
    pub kind: ResourceKind,
    pub label: String,
    pub subtitle: Option<String>,
    pub reference_token: String,
    pub source_element_id: Option<String>,
    pub asset_id: Option<String>,
    pub preview: ResourcePreview,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct ResourceGroup {
    pub kind: ResourceKind,
    pub label: String,
    pub entries: Vec<ResourceEntry>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
pub struct DocumentResources {
    pub groups: Vec<ResourceGroup>,
    pub revision: u64,
}

pub fn resource_preview_lib_source(ast: &DocumentAST, template: &TemplateSpec) -> String {
    crate::document_session_generation::generate_lib_typst(ast, template).source
}
