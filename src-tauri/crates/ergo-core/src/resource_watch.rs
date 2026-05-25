use crate::ast::{AssetEntry, DocumentAST, DocumentElement, DocumentSection};
use crate::document_resources::{
    DocumentResources, ResourceEntry, ResourceGroup, ResourceKind, ResourcePreview,
    ResourcePreviewStatus,
};
use crate::template_spec::TemplateSpec;
use crate::vfs::VirtualFileSystem;

pub const RESOURCE_WATCH_MAIN: &str = "resources.typ";
pub const RESOURCE_LIB: &str = "lib.typ";

pub fn write_resource_files(
    vfs: &VirtualFileSystem,
    ast: &DocumentAST,
    template: &TemplateSpec,
    lib_source: &str,
) {
    write_if_changed(vfs, RESOURCE_LIB, lib_source);

    let seeds = assign_preview_pages(resource_seeds(ast));
    let mut resource_source = String::new();

    let width_pt = template
        .resource_policy
        .as_ref()
        .and_then(|p| p.preview.as_ref())
        .and_then(|p| p.width_pt)
        .unwrap_or(360.0);
    let margin_pt = template
        .resource_policy
        .as_ref()
        .and_then(|p| p.preview.as_ref())
        .and_then(|p| p.margin_pt)
        .unwrap_or(8.0);

    resource_source.push_str(
        "#import \"/lib.typ\": *\n\
         #show: apply\n",
    );
    resource_source.push_str(&format!(
        "#set page(\n\
           width: {}pt,\n\
           height: auto,\n\
           margin: {}pt,\n\
           fill: white,\n\
           header: none,\n\
           footer: none,\n\
           numbering: none,\n\
         )\n\
         #show page: set page(\n\
           fill: white,\n\
           header: none,\n\
           footer: none,\n\
           numbering: none,\n\
         )\n\n",
        format_pt(width_pt),
        format_pt(margin_pt),
    ));

    let mut preview_page_index = 0usize;
    for seed in &seeds {
        if let Some(body) = &seed.preview_source {
            if preview_page_index > 0 {
                resource_source.push_str("#pagebreak()\n\n");
            }
            preview_page_index += 1;
            resource_source.push_str(body);
            resource_source.push_str("\n\n");
        }
    }

    if !vfs.is_source_equal(RESOURCE_WATCH_MAIN, &resource_source) {
        vfs.write_source(RESOURCE_WATCH_MAIN, resource_source);
    }
}

pub fn build_resource_catalog(
    ast: &DocumentAST,
    _template: &TemplateSpec,
    vfs: &VirtualFileSystem,
) -> DocumentResources {
    let seeds = assign_preview_pages(resource_seeds(ast));
    let mut groups = Vec::new();
    for (kind, label) in [
        (ResourceKind::Figure, "Figures"),
        (ResourceKind::Table, "Tables"),
        (ResourceKind::Equation, "Equations"),
        (ResourceKind::File, "Files"),
        (ResourceKind::Custom, "Custom"),
    ] {
        let entries: Vec<ResourceEntry> = seeds
            .iter()
            .filter(|seed| seed.kind == kind)
            .map(|seed| {
                let preview = preview_for_seed(seed);
                ResourceEntry {
                    id: seed.id.clone(),
                    kind: seed.kind.clone(),
                    label: seed.label.clone(),
                    subtitle: seed.subtitle.clone(),
                    reference_token: seed.reference_token.clone(),
                    source_element_id: seed.source_element_id.clone(),
                    asset_id: seed.asset_id.clone(),
                    preview,
                }
            })
            .collect();

        if !entries.is_empty() {
            groups.push(ResourceGroup {
                kind,
                label: label.to_string(),
                entries,
            });
        }
    }

    DocumentResources {
        groups,
        revision: vfs.latest_revision(),
    }
}

pub fn build_resource_catalog_with_failure(
    ast: &DocumentAST,
    template: &TemplateSpec,
    vfs: &VirtualFileSystem,
    diagnostic: String,
) -> DocumentResources {
    let mut resources = build_resource_catalog(ast, template, vfs);
    for group in &mut resources.groups {
        for entry in &mut group.entries {
            if entry.preview.status != ResourcePreviewStatus::Ready {
                entry.preview = ResourcePreview {
                    status: ResourcePreviewStatus::Failed,
                    path: None,
                    page_number: None,
                    content: None,
                    diagnostic: Some(diagnostic.clone()),
                };
            }
        }
    }
    resources
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
    preview_page: Option<u32>,
    missing_diagnostic: Option<String>,
}

fn preview_for_seed(seed: &ResourceSeed) -> ResourcePreview {
    if let Some(page) = seed.preview_page {
        ResourcePreview {
            status: ResourcePreviewStatus::Ready,
            path: None,
            page_number: Some(page),
            content: None,
            diagnostic: None,
        }
    } else {
        ResourcePreview {
            status: ResourcePreviewStatus::Missing,
            path: None,
            page_number: None,
            content: None,
            diagnostic: seed.missing_diagnostic.clone(),
        }
    }
}

fn assign_preview_pages(mut seeds: Vec<ResourceSeed>) -> Vec<ResourceSeed> {
    let mut page = 0u32;
    for seed in &mut seeds {
        if seed.preview_source.is_some() {
            page += 1;
            seed.preview_page = Some(page);
        } else {
            seed.preview_page = None;
        }
    }
    seeds
}

fn resource_seeds(ast: &DocumentAST) -> Vec<ResourceSeed> {
    let mut seeds = Vec::new();
    for asset in &ast.assets {
        seeds.push(file_seed(asset));
    }
    for section in &ast.sections {
        let DocumentSection::Content(content) = section;
        for element in &content.elements {
            collect_element_seeds(element, &mut seeds, &ast.assets);
        }
    }
    seeds
}

fn collect_element_seeds(
    element: &DocumentElement,
    seeds: &mut Vec<ResourceSeed>,
    assets: &[AssetEntry],
) {
    match element {
        DocumentElement::Equation(equation) => {
            let source = normalize_math_source(&equation.latex_source);
            let body = if source.is_empty() {
                String::new()
            } else {
                format!("#math.equation(block: {}, ${source}$)", equation.is_block)
            };
            seeds.push(ResourceSeed {
                id: equation.id.clone(),
                kind: ResourceKind::Equation,
                label: "Equation".to_string(),
                subtitle: Some(equation.latex_source.clone()),
                reference_token: reference_token(&equation.id),
                source_element_id: Some(equation.id.clone()),
                asset_id: None,
                preview_source: Some(wrap_body(&body)),
                preview_page: None,
                missing_diagnostic: None,
            });
        }
        DocumentElement::Table(table) => {
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
            seeds.push(ResourceSeed {
                id: table.id.clone(),
                kind: ResourceKind::Table,
                label: "Table".to_string(),
                subtitle: Some(format!("{} x {}", table.rows, table.cols)),
                reference_token: reference_token(&table.id),
                source_element_id: Some(table.id.clone()),
                asset_id: None,
                preview_source: Some(wrap_body(&body)),
                preview_page: None,
                missing_diagnostic: None,
            });
        }
        DocumentElement::Figure(figure) => {
            let asset_ref = figure
                .asset_id
                .as_deref()
                .and_then(|id| assets.iter().find(|a| a.id == id));
            let caption = figure.caption.trim();
            let label = if caption.is_empty() {
                "Figure".to_string()
            } else {
                caption.to_string()
            };
            let body = asset_ref
                .map(|a| format!("#image(\"{}\", width: 100%)", escape_typst_string(&a.path)))
                .unwrap_or_else(|| "[Figure]".to_string());
            seeds.push(ResourceSeed {
                id: figure.id.clone(),
                kind: ResourceKind::Figure,
                label,
                subtitle: asset_ref.map(|a| a.path.clone()),
                reference_token: reference_token(&figure.id),
                source_element_id: Some(figure.id.clone()),
                asset_id: figure.asset_id.clone(),
                preview_source: Some(wrap_body(&body)),
                preview_page: None,
                missing_diagnostic: None,
            });
            collect_element_seeds(&figure.content, seeds, assets);
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
                preview_source: Some(wrap_body(&body)),
                preview_page: None,
                missing_diagnostic: None,
            });
        }
        DocumentElement::Heading(_) | DocumentElement::Paragraph(_) => {}
    }
}

fn file_seed(asset: &AssetEntry) -> ResourceSeed {
    let body = if asset.kind == "image" || image_path(&asset.path) {
        format!(
            "#image(\"{}\", width: 100%)",
            escape_typst_string(&asset.path)
        )
    } else {
        format!("[{}]", escape_typst(&asset.path))
    };
    ResourceSeed {
        id: asset.id.clone(),
        kind: ResourceKind::File,
        label: asset.caption.clone().unwrap_or_else(|| asset.path.clone()),
        subtitle: Some(asset.path.clone()),
        reference_token: reference_token(&asset.id),
        source_element_id: None,
        asset_id: Some(asset.id.clone()),
        preview_source: Some(wrap_body(&body)),
        preview_page: None,
        missing_diagnostic: None,
    }
}

fn wrap_body(body: &str) -> String {
    format!("#block(width: 100%)[\n{body}\n]\n")
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
        .any(|ext| lower.ends_with(ext))
}

fn reference_token(id: &str) -> String {
    format!("@ergo-{}", path_id_for_id(id))
}

fn path_id_for_id(id: &str) -> String {
    let mut normalized = String::new();
    let mut prev_dash = false;
    for ch in id.to_lowercase().chars() {
        let next = if ch.is_ascii_alphanumeric() || ch == '_' {
            ch
        } else {
            '-'
        };
        if next == '-' {
            if !prev_dash {
                normalized.push(next);
            }
            prev_dash = true;
        } else {
            normalized.push(next);
            prev_dash = false;
        }
    }
    normalized.trim_matches('-').to_string()
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

fn write_if_changed(vfs: &VirtualFileSystem, path: &str, source: &str) {
    if !vfs.is_source_equal(path, source) {
        vfs.write_source(path, source.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{AssetEntry, DocumentElement, DocumentSection, Equation, Figure, Paragraph};
    use crate::test_fixtures::{basic_document_ast, rich_text};

    #[test]
    fn resource_preview_typst_uses_same_lib_and_strips_page_chrome() {
        use crate::template_spec::load_bundled_template;

        let ast = basic_document_ast("Title", "");
        let template = load_bundled_template("versatile-apa").unwrap();
        let vfs = VirtualFileSystem::new();
        let lib = crate::document_resources::resource_preview_lib_source(&ast, &template);

        write_resource_files(&vfs, &ast, &template, &lib);

        let lib_source = vfs.read_source(RESOURCE_LIB).unwrap();
        assert!(lib_source.contains("#show: apa-style"));

        let resources = vfs.read_source(RESOURCE_WATCH_MAIN).unwrap();
        assert!(resources.contains("#show: apply"));
        assert!(resources.contains("fill: white"));
        assert!(resources.contains("#show page: set page"));
        assert!(resources.contains("header: none"));
        assert!(resources.contains("numbering: none"));
    }

    #[test]
    fn preview_pages_skip_seeds_without_preview_source() {
        let mut ast = basic_document_ast("Title", "");
        ast.assets.push(AssetEntry {
            id: "asset-1".to_string(),
            path: "assets/photo.png".to_string(),
            kind: "image".to_string(),
            caption: None,
        });

        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Equation(Equation {
            id: "eq-1".to_string(),
            latex_source: "E=mc^2".to_string(),
            is_block: false,
        }));
        content
            .elements
            .push(DocumentElement::Figure(Box::new(Figure {
                id: "fig-1".to_string(),
                asset_id: Some("asset-1".to_string()),
                caption: "Caption".to_string(),
                placement: "auto".to_string(),
                content: DocumentElement::Paragraph(Paragraph {
                    id: "fig-body".to_string(),
                    content: vec![rich_text("")],
                }),
                extra_fields: std::collections::HashMap::new(),
            })));

        let seeds = assign_preview_pages(resource_seeds(&ast));
        let file_seed = seeds
            .iter()
            .find(|seed| seed.kind == ResourceKind::File)
            .unwrap();
        let equation_seed = seeds
            .iter()
            .find(|seed| seed.kind == ResourceKind::Equation)
            .unwrap();
        let figure_seed = seeds
            .iter()
            .find(|seed| seed.kind == ResourceKind::Figure)
            .unwrap();

        assert_eq!(file_seed.preview_page, Some(1));
        assert_eq!(equation_seed.preview_page, Some(2));
        assert_eq!(figure_seed.preview_page, Some(3));
    }
}
