use std::collections::{hash_map::DefaultHasher, HashSet};
use std::hash::{Hash, Hasher};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use typst::diag::{Severity, SourceDiagnostic};
use typst::layout::PagedDocument;

use crate::ast::{AssetEntry, DocumentAST, DocumentElement, DocumentSection, Figure, Table};
use crate::path_utils::file_id_for_virtual_path;
use crate::template_spec::{ResourcePreviewPolicySpec, TemplateSpec};
use crate::vfs::VirtualFileSystem;
use crate::world::{SnapshotWorld, WorldSourceSnapshot};

const RESOURCE_PREVIEW_DIR: &str = ".ergproj/resource-previews/svg";
pub(crate) const RESOURCE_PREVIEW_LIB_PATH: &str = "lib.typ";
const RESOURCE_PREVIEW_SOURCE: &str = ".ergproj/resource-previews/resource.typ";
const PREVIEW_WIDTH_PT: usize = 360;
const PREVIEW_MARGIN_PT: usize = 8;

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
}

#[derive(Clone, Debug)]
pub(crate) struct ResourcePreviewState {
    pub ast: DocumentAST,
    pub dirty_resource_ids: HashSet<String>,
    pub resource_preview_lib_hash: u64,
}

struct ResourceSeed {
    id: String,
    kind: ResourceKind,
    label: String,
    subtitle: Option<String>,
    reference_token: String,
    source_element_id: Option<String>,
    asset_id: Option<String>,
    preview_source: Option<String>,
    cache_fingerprint: String,
    missing_diagnostic: Option<String>,
}

#[derive(Clone)]
struct ResourcePreviewOptions {
    width_pt: f32,
    margin_pt: f32,
    wrapper: Option<String>,
    lib_hash: String,
}

pub(crate) fn compile_document_resources(
    ast: &DocumentAST,
    vfs: &Arc<VirtualFileSystem>,
    template: &TemplateSpec,
    dirty_resource_ids: &HashSet<String>,
    resource_preview_lib_hash: u64,
) -> DocumentResources {
    ensure_resource_preview_lib(vfs, ast, template);
    let source_snapshot = WorldSourceSnapshot::from_vfs(vfs);
    let preview_options =
        ResourcePreviewOptions::from_template(template, resource_preview_lib_hash);
    let mut groups = Vec::new();

    for (kind, label) in [
        (ResourceKind::Figure, "Figures"),
        (ResourceKind::Table, "Tables"),
        (ResourceKind::Equation, "Equations"),
        (ResourceKind::File, "Files"),
        (ResourceKind::Custom, "Custom"),
    ] {
        let entries = resource_seeds(ast, vfs, &preview_options)
            .into_iter()
            .filter(|seed| seed.kind == kind)
            .map(|seed| {
                let force_compile = dirty_resource_ids.contains(&seed.id);
                entry_from_seed(seed, vfs, &source_snapshot, force_compile)
            })
            .collect::<Vec<_>>();

        if !entries.is_empty() {
            groups.push(ResourceGroup {
                kind,
                label: label.to_string(),
                entries,
            });
        }
    }

    DocumentResources { groups }
}

fn entry_from_seed(
    seed: ResourceSeed,
    vfs: &VirtualFileSystem,
    source_snapshot: &WorldSourceSnapshot,
    force_compile: bool,
) -> ResourceEntry {
    let preview = if let Some(diagnostic) = seed.missing_diagnostic.clone() {
        ResourcePreview {
            status: ResourcePreviewStatus::Missing,
            path: None,
            diagnostic: Some(diagnostic),
        }
    } else if let Some(preview_source) = seed.preview_source.clone() {
        let cache_fingerprint =
            fingerprint(&format!("{}:{}", seed.cache_fingerprint, preview_source));
        compile_resource_preview(
            vfs,
            source_snapshot,
            &seed.id,
            &cache_fingerprint,
            &preview_source,
            force_compile,
        )
    } else {
        ResourcePreview {
            status: ResourcePreviewStatus::Failed,
            path: None,
            diagnostic: Some("Resource has no preview source".to_string()),
        }
    };

    ResourceEntry {
        id: seed.id,
        kind: seed.kind,
        label: seed.label,
        subtitle: seed.subtitle,
        reference_token: seed.reference_token,
        source_element_id: seed.source_element_id,
        asset_id: seed.asset_id,
        preview,
    }
}

fn resource_seeds(
    ast: &DocumentAST,
    vfs: &VirtualFileSystem,
    preview_options: &ResourcePreviewOptions,
) -> Vec<ResourceSeed> {
    let mut seeds = Vec::new();
    for asset in &ast.assets {
        seeds.push(file_seed(asset, vfs, preview_options));
    }

    for section in &ast.sections {
        let DocumentSection::Content(content) = section;
        for element in &content.elements {
            match element {
                DocumentElement::Equation(equation) => {
                    let body = format!("$ {} $", normalize_math_source(&equation.latex_source));
                    seeds.push(ResourceSeed {
                        id: equation.id.clone(),
                        kind: ResourceKind::Equation,
                        label: "Equation".to_string(),
                        subtitle: Some(equation.latex_source.clone()),
                        reference_token: reference_token(&equation.id),
                        source_element_id: Some(equation.id.clone()),
                        asset_id: None,
                        cache_fingerprint: fingerprint(&body),
                        preview_source: Some(preview_options.wrap_resource_body(&body)),
                        missing_diagnostic: None,
                    });
                }
                DocumentElement::Table(table) => seeds.push(table_seed(table, preview_options)),
                DocumentElement::Figure(figure) => {
                    seeds.push(figure_seed(figure, &ast.assets, vfs, preview_options))
                }
                DocumentElement::Custom(custom) => {
                    let body = format!("[{}]", escape_typst(&custom.element_type));
                    seeds.push(ResourceSeed {
                        id: custom.id.clone(),
                        kind: ResourceKind::Custom,
                        label: custom.element_type.clone(),
                        subtitle: None,
                        reference_token: reference_token(&custom.id),
                        source_element_id: Some(custom.id.clone()),
                        asset_id: None,
                        cache_fingerprint: fingerprint(&body),
                        preview_source: Some(preview_options.wrap_resource_body(&body)),
                        missing_diagnostic: None,
                    });
                }
                DocumentElement::Heading(_) | DocumentElement::Paragraph(_) => {}
            }
        }
    }

    seeds
}

fn file_seed(
    asset: &AssetEntry,
    vfs: &VirtualFileSystem,
    preview_options: &ResourcePreviewOptions,
) -> ResourceSeed {
    let body = if asset.kind == "image" || image_path(&asset.path) {
        format!(
            "#image(\"{}\", width: 100%)",
            escape_typst_string(&asset.path)
        )
    } else {
        format!("[{}]", escape_typst(&asset.path))
    };
    let bytes_hash = vfs
        .read_file(&asset.path)
        .map(|bytes| fingerprint_bytes(&bytes))
        .unwrap_or_else(|_| "missing".to_string());
    let missing_diagnostic =
        (!vfs.has_file(&asset.path)).then(|| format!("Resource file {} was not found", asset.path));

    ResourceSeed {
        id: asset.id.clone(),
        kind: ResourceKind::File,
        label: asset.caption.clone().unwrap_or_else(|| asset.path.clone()),
        subtitle: Some(asset.path.clone()),
        reference_token: reference_token(&asset.id),
        source_element_id: None,
        asset_id: Some(asset.id.clone()),
        cache_fingerprint: fingerprint(&format!("{}:{body}:{bytes_hash}", asset.id)),
        preview_source: Some(preview_options.wrap_resource_body(&body)),
        missing_diagnostic,
    }
}

fn table_seed(table: &Table, preview_options: &ResourcePreviewOptions) -> ResourceSeed {
    let columns = if table.column_sizes.is_empty() {
        "1fr".to_string()
    } else {
        table.column_sizes.join(", ")
    };
    let mut body = format!("#table(\n  columns: ({columns})");
    for row in &table.cells {
        for cell in row {
            body.push_str(",\n  [");
            body.push_str(&escape_typst(&cell.content));
            body.push(']');
        }
    }
    body.push_str("\n)");

    ResourceSeed {
        id: table.id.clone(),
        kind: ResourceKind::Table,
        label: "Table".to_string(),
        subtitle: Some(format!("{} x {}", table.rows, table.cols)),
        reference_token: reference_token(&table.id),
        source_element_id: Some(table.id.clone()),
        asset_id: None,
        cache_fingerprint: fingerprint(&body),
        preview_source: Some(preview_options.wrap_resource_body(&body)),
        missing_diagnostic: None,
    }
}

fn figure_seed(
    figure: &Figure,
    assets: &[AssetEntry],
    vfs: &VirtualFileSystem,
    preview_options: &ResourcePreviewOptions,
) -> ResourceSeed {
    let asset = figure
        .asset_id
        .as_deref()
        .and_then(|asset_id| assets.iter().find(|entry| entry.id == asset_id));
    let caption = figure.caption.trim();
    let label = if caption.is_empty() {
        "Figure".to_string()
    } else {
        caption.to_string()
    };
    let body = asset
        .map(|asset| {
            format!(
                "#image(\"{}\", width: 100%)",
                escape_typst_string(&asset.path)
            )
        })
        .unwrap_or_else(|| "[Figure]".to_string());
    let missing_diagnostic = asset
        .filter(|asset| !vfs.has_file(&asset.path))
        .map(|asset| format!("Resource file {} was not found", asset.path));

    ResourceSeed {
        id: figure.id.clone(),
        kind: ResourceKind::Figure,
        label,
        subtitle: asset.map(|asset| asset.path.clone()),
        reference_token: reference_token(&figure.id),
        source_element_id: Some(figure.id.clone()),
        asset_id: figure.asset_id.clone(),
        cache_fingerprint: fingerprint(&format!("{body}:{caption}")),
        preview_source: Some(preview_options.wrap_resource_body(&body)),
        missing_diagnostic,
    }
}

fn compile_resource_preview(
    vfs: &VirtualFileSystem,
    source_snapshot: &WorldSourceSnapshot,
    resource_id: &str,
    cache_fingerprint: &str,
    source: &str,
    force_compile: bool,
) -> ResourcePreview {
    let path = format!(
        "{}/{}-{}.svg",
        RESOURCE_PREVIEW_DIR,
        path_id_for_id(resource_id),
        cache_fingerprint
    );
    if !force_compile && vfs.has_file(&path) {
        return ResourcePreview {
            status: ResourcePreviewStatus::Ready,
            path: Some(path),
            diagnostic: None,
        };
    }

    let world = SnapshotWorld::new(
        source_snapshot
            .clone()
            .with_source(RESOURCE_PREVIEW_SOURCE, source.to_string()),
        file_id_for_virtual_path(RESOURCE_PREVIEW_SOURCE),
    );

    match typst::compile::<PagedDocument>(&world).output {
        Ok(document) => {
            let svg = document
                .pages
                .first()
                .map(typst_svg::svg)
                .unwrap_or_default();
            vfs.write_file(&path, svg.into_bytes());
            ResourcePreview {
                status: ResourcePreviewStatus::Ready,
                path: Some(path),
                diagnostic: None,
            }
        }
        Err(errors) => ResourcePreview {
            status: ResourcePreviewStatus::Failed,
            path: None,
            diagnostic: Some(format_source_diagnostics(&errors)),
        },
    }
}

fn format_source_diagnostics(errors: &[SourceDiagnostic]) -> String {
    errors
        .iter()
        .map(|error| {
            let severity = match error.severity {
                Severity::Error => "error",
                Severity::Warning => "warning",
            };
            format!("{severity}: {}", error.message)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

impl ResourcePreviewOptions {
    fn from_template(template: &TemplateSpec, resource_preview_lib_hash: u64) -> Self {
        let policy = template
            .resource_policy
            .as_ref()
            .and_then(|policy| policy.preview.as_ref());

        Self {
            width_pt: positive_or_default(
                policy.and_then(|preview| preview.width_pt),
                PREVIEW_WIDTH_PT as f32,
            ),
            margin_pt: non_negative_or_default(
                policy.and_then(|preview| preview.margin_pt),
                PREVIEW_MARGIN_PT as f32,
            ),
            wrapper: policy.and_then(ResourcePreviewPolicySpec::wrapper).cloned(),
            lib_hash: format!("{resource_preview_lib_hash:x}"),
        }
    }

    fn wrap_resource_body(&self, body: &str) -> String {
        let body = if let Some(wrapper) = &self.wrapper {
            format!("#{wrapper}[\n{body}\n]")
        } else {
            body.to_string()
        };

        format!(
            "#import \"/lib.typ\": *\n\
             // resource-preview-lib: {}\n\
             #show: apply\n\
             #set page(width: {}pt, height: auto, margin: {}pt)\n\
             #block(width: 100%)[\n{body}\n]\n",
            self.lib_hash,
            format_pt(self.width_pt),
            format_pt(self.margin_pt)
        )
    }
}

impl ResourcePreviewPolicySpec {
    fn wrapper(&self) -> Option<&String> {
        self.wrapper
            .as_ref()
            .filter(|value| !value.trim().is_empty())
    }
}

fn positive_or_default(value: Option<f32>, default: f32) -> f32 {
    value
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(default)
}

fn non_negative_or_default(value: Option<f32>, default: f32) -> f32 {
    value
        .filter(|value| value.is_finite() && *value >= 0.0)
        .unwrap_or(default)
}

pub(crate) fn resource_preview_lib_source(ast: &DocumentAST, template: &TemplateSpec) -> String {
    crate::document_session_generation::generate_lib_typst(ast, template).source
}

pub(crate) fn resource_preview_lib_hash(ast: &DocumentAST, template: &TemplateSpec) -> u64 {
    hash_value(&resource_preview_lib_source(ast, template))
}

pub(crate) fn ensure_resource_preview_lib(
    vfs: &VirtualFileSystem,
    ast: &DocumentAST,
    template: &TemplateSpec,
) -> u64 {
    let source = resource_preview_lib_source(ast, template);
    if vfs.is_source_equal(RESOURCE_PREVIEW_LIB_PATH, &source) {
        vfs.source_revision(RESOURCE_PREVIEW_LIB_PATH).unwrap_or(0)
    } else {
        vfs.write_source(RESOURCE_PREVIEW_LIB_PATH, source)
    }
}

fn format_pt(value: f32) -> String {
    let mut formatted = format!("{value:.2}");
    while formatted.contains('.') && formatted.ends_with('0') {
        formatted.pop();
    }
    if formatted.ends_with('.') {
        formatted.pop();
    }
    formatted
}

fn reference_token(id: &str) -> String {
    format!("@ergo-{}", path_id_for_id(id))
}

fn normalize_math_source(value: &str) -> String {
    value.trim().trim_matches('$').trim().to_string()
}

fn escape_typst(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

fn escape_typst_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn image_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]
        .iter()
        .any(|extension| lower.ends_with(extension))
}

fn path_id_for_id(id: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_dash = false;

    for character in id.to_lowercase().chars() {
        let next = if character.is_ascii_alphanumeric() || character == '_' {
            character
        } else {
            '-'
        };

        if next == '-' {
            if !previous_was_dash {
                normalized.push(next);
            }
            previous_was_dash = true;
        } else {
            normalized.push(next);
            previous_was_dash = false;
        }
    }

    normalized.trim_matches('-').to_string()
}

fn fingerprint(value: &str) -> String {
    format!("{:x}", hash_value(value))
}

fn hash_value(value: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn fingerprint_bytes(value: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{Equation, TableCell};
    use crate::test_fixtures::basic_document_ast;

    #[test]
    fn catalog_includes_tables_equations_and_imported_files() {
        let vfs = Arc::new(VirtualFileSystem::new());
        vfs.write_file("assets/chart.png", vec![137, 80, 78, 71]);
        let mut ast = basic_document_ast("Title", "Abstract");
        ast.assets.push(AssetEntry {
            id: "asset-1".to_string(),
            path: "assets/chart.png".to_string(),
            kind: "image".to_string(),
            caption: Some("Chart".to_string()),
        });
        let DocumentSection::Content(section) = &mut ast.sections[0];
        section.elements.push(DocumentElement::Equation(Equation {
            id: "equation-1".to_string(),
            latex_source: "E = mc^2".to_string(),
            is_block: true,
        }));

        let resources = compile_document_resources(
            &ast,
            &vfs,
            &crate::template_spec::load_bundled_template("versatile-apa").unwrap(),
            &HashSet::new(),
            0,
        );

        assert!(resources
            .groups
            .iter()
            .any(|group| group.kind == ResourceKind::File));
        assert!(resources
            .groups
            .iter()
            .any(|group| group.kind == ResourceKind::Equation));
    }

    #[test]
    fn resource_preview_compiles_table_with_fractional_columns() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let table = Table {
            id: "table-1".to_string(),
            rows: 1,
            cols: 2,
            cells: vec![vec![
                TableCell {
                    content: "A".to_string(),
                    row_span: None,
                    col_span: None,
                },
                TableCell {
                    content: "B".to_string(),
                    row_span: None,
                    col_span: None,
                },
            ]],
            column_sizes: vec!["1fr".to_string(), "2fr".to_string()],
            extra_fields: Default::default(),
        };
        let options = ResourcePreviewOptions::from_template(
            &crate::template_spec::load_bundled_template("versatile-apa").unwrap(),
            0,
        );
        let seed = table_seed(&table, &options);
        let template = crate::template_spec::load_bundled_template("versatile-apa").unwrap();
        vfs.write_source(
            RESOURCE_PREVIEW_LIB_PATH,
            resource_preview_lib_source(&basic_document_ast("Title", ""), &template),
        );
        let entry = entry_from_seed(seed, &vfs, &WorldSourceSnapshot::from_vfs(&vfs), false);

        assert_eq!(entry.preview.status, ResourcePreviewStatus::Ready);
        assert!(entry
            .preview
            .path
            .unwrap()
            .starts_with(RESOURCE_PREVIEW_DIR));
    }
}
