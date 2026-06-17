use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ast::DocumentAST;
use crate::template_spec::TemplateSpec;
use crate::typst_source::escape_typst_string;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ResourceKind {
    Figure,
    Diagram,
    Table,
    Equation,
    Custom,
}

/// How one page axis is sized in a resource preview.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResourcePreviewPageAxis {
    /// Size the axis to the resource content (`width: auto` / `height: auto`).
    HugContent,
    /// Size the axis to the main document paper (`paper: …` on `#set page`).
    MatchDocument,
}

/// Per-axis page sizing for a resource preview page.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ResourcePreviewPageSize {
    pub width: ResourcePreviewPageAxis,
    pub height: ResourcePreviewPageAxis,
}

impl ResourceKind {
    pub fn preview_page_size(&self) -> ResourcePreviewPageSize {
        let _ = self;
        ResourcePreviewPageSize {
            width: ResourcePreviewPageAxis::MatchDocument,
            height: ResourcePreviewPageAxis::HugContent,
        }
    }
}

pub fn resource_preview_paper_size(ast: &DocumentAST) -> &str {
    ast.metadata
        .project_settings
        .paper_size
        .as_deref()
        .map(str::trim)
        .filter(|paper| !paper.is_empty())
        .unwrap_or("us-letter")
}

pub fn resource_preview_page_setup_typst(
    page_size: ResourcePreviewPageSize,
    paper_size: &str,
    margin_pt: f32,
) -> String {
    let margin = format_pt(margin_pt);
    let mut out = String::from("#page(\n");

    if page_size.width == ResourcePreviewPageAxis::MatchDocument
        || page_size.height == ResourcePreviewPageAxis::MatchDocument
    {
        out.push_str(&format!(
            "  paper: \"{}\",\n",
            escape_typst_string(paper_size)
        ));
    }
    if page_size.width == ResourcePreviewPageAxis::HugContent {
        out.push_str("  width: auto,\n");
    }
    if page_size.height == ResourcePreviewPageAxis::HugContent {
        out.push_str("  height: auto,\n");
    }

    out.push_str(&format!(
        "  margin: {margin}pt,\n\
           fill: white,\n\
           header: none,\n\
           footer: none,\n\
           numbering: none,\n\
         )[\n"
    ));
    out
}

/// Per-page preview chrome and sizing. The document-level `#show: apply` in
/// `resources.typ` supplies the same template styling as the main document.
pub fn wrap_resource_preview_body(
    body: &str,
    page_size: ResourcePreviewPageSize,
    paper_size: &str,
    margin_pt: f32,
) -> String {
    let page_open = resource_preview_page_setup_typst(page_size, paper_size, margin_pt);
    let inner = if page_size.width == ResourcePreviewPageAxis::MatchDocument {
        format!("#block(width: 100%)[\n{body}\n]\n")
    } else {
        format!("#block[\n{body}\n]\n")
    };
    format!("{page_open}{inner}]\n")
}

fn format_pt(value: f32) -> String {
    let mut s = format!("{value:.2}");
    while s.contains('.') && s.ends_with('0') {
        s.pop();
    }
    if s.ends_with('.') {
        s.pop();
    }
    s
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ResourcePreviewStatus {
    Ready,
    Failed,
    Missing,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct ResourcePreview {
    pub status: ResourcePreviewStatus,
    pub path: Option<String>,
    // 1-based page index in the compiled resource preview document.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub diagnostic: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
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
#[ts(export)]
pub struct ResourceGroup {
    pub kind: ResourceKind,
    pub label: String,
    pub entries: Vec<ResourceEntry>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export)]
pub struct DocumentResources {
    pub groups: Vec<ResourceGroup>,
    pub revision: u64,
}

pub fn resource_preview_lib_source(ast: &DocumentAST, template: &TemplateSpec) -> String {
    crate::typst_source::generate_resource_preview_lib_typst(ast, template).source
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_page_size_policy_by_kind() {
        let match_width_hug_height = ResourcePreviewPageSize {
            width: ResourcePreviewPageAxis::MatchDocument,
            height: ResourcePreviewPageAxis::HugContent,
        };

        for kind in [
            ResourceKind::Figure,
            ResourceKind::Diagram,
            ResourceKind::Table,
            ResourceKind::Equation,
            ResourceKind::Custom,
        ] {
            assert_eq!(kind.preview_page_size(), match_width_hug_height, "{kind:?}");
        }
    }
}
