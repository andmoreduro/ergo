use crate::ast::{AssetEntry, DocumentAST, DocumentElement, DocumentSection, ReferenceEntry};
use crate::document_resources::{
    resource_preview_paper_size, wrap_resource_preview_body, DocumentResources, ResourceEntry,
    ResourceGroup, ResourceKind, ResourcePreview, ResourcePreviewStatus,
};
use crate::template_spec::TemplateSpec;
use crate::typst_source::path_id_for_id;
use crate::typst_source::resource_preview_typst_for_element;
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

    let seeds = assign_preview_pages(resource_seeds(ast, template, vfs));
    let mut resource_source = String::new();

    let margin_pt = template
        .typst
        .resource_policy
        .as_ref()
        .and_then(|p| p.preview.as_ref())
        .and_then(|p| p.margin_pt)
        .unwrap_or(8.0);
    let paper_size = resource_preview_paper_size(ast);

    resource_source.push_str("#import \"/lib.typ\": *\n#show: apply\n\n");

    let mut preview_page_index = 0usize;
    for seed in &seeds {
        if let Some(body) = &seed.preview_source {
            if preview_page_index > 0 {
                resource_source.push('\n');
            }
            preview_page_index += 1;
            resource_source.push_str(&wrap_resource_preview_body(
                body,
                seed.kind.preview_page_size(),
                paper_size,
                margin_pt,
            ));
            resource_source.push_str("\n\n");
        }
    }

    if !vfs.is_source_equal(RESOURCE_WATCH_MAIN, &resource_source) {
        vfs.write_source(RESOURCE_WATCH_MAIN, resource_source);
    }
}

pub fn build_resource_catalog(
    ast: &DocumentAST,
    template: &TemplateSpec,
    vfs: &VirtualFileSystem,
) -> DocumentResources {
    let seeds = assign_preview_pages(resource_seeds(ast, template, vfs));
    let mut groups = Vec::new();
    for (kind, label) in [
        // Diagrams are grouped under Figures (a diagram is a generated-SVG image),
        // so there is no separate Diagrams group.
        (ResourceKind::Figure, "Figures"),
        (ResourceKind::Table, "Tables"),
        (ResourceKind::Equation, "Equations"),
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
    // Only overwrite entries that were actually going to be rendered. Missing
    // assets already carry their own diagnostic and should keep it.
    for group in &mut resources.groups {
        for entry in &mut group.entries {
            if entry.preview.status == ResourcePreviewStatus::Ready {
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

fn resource_seeds(
    ast: &DocumentAST,
    template: &TemplateSpec,
    vfs: &VirtualFileSystem,
) -> Vec<ResourceSeed> {
    let _ = vfs;
    let mut seeds = Vec::new();
    for section in &ast.sections {
        let DocumentSection::Content(content) = section;
        for element in &content.elements {
            collect_element_seeds(element, &mut seeds, &ast.assets, template, &ast.references);
        }
    }
    seeds
}

fn collect_element_seeds(
    element: &DocumentElement,
    seeds: &mut Vec<ResourceSeed>,
    assets: &[AssetEntry],
    template: &TemplateSpec,
    references: &[ReferenceEntry],
) {
    match element {
        DocumentElement::Equation(equation) => {
            let body = resource_preview_typst_for_element(element, template, assets, references)
                .unwrap_or_default();
            seeds.push(ResourceSeed {
                id: equation.id.clone(),
                kind: ResourceKind::Equation,
                label: "Equation".to_string(),
                subtitle: Some(equation.latex_source.clone()),
                reference_token: reference_token(&equation.id),
                source_element_id: Some(equation.id.clone()),
                asset_id: None,
                preview_source: Some(body),
                preview_page: None,
                missing_diagnostic: None,
            });
        }
        DocumentElement::Diagram(diagram) => {
            // A diagram is an image whose asset is a generated SVG, so it belongs
            // in the Figures group and shares the figure preview pipeline (same
            // `image(...)` Typst body). Grouping it as `Figure` keeps it alongside
            // other images instead of in a separate Diagrams section.
            let asset_ref = diagram
                .asset_id
                .as_deref()
                .and_then(|id| assets.iter().find(|a| a.id == id));
            let caption = diagram.caption.trim();
            let label = if caption.is_empty() {
                "Diagram".to_string()
            } else {
                caption.to_string()
            };
            let preview_body =
                resource_preview_typst_for_element(element, template, assets, references);
            seeds.push(ResourceSeed {
                id: diagram.id.clone(),
                kind: ResourceKind::Figure,
                label,
                subtitle: asset_ref.map(|a| a.path.clone()),
                reference_token: reference_token(&diagram.id),
                source_element_id: Some(diagram.id.clone()),
                asset_id: diagram.asset_id.clone(),
                preview_source: preview_body,
                preview_page: None,
                missing_diagnostic: Some("Diagram SVG has not been generated".to_string()),
            });
        }
        DocumentElement::Table(table) => {
            let preview_body =
                resource_preview_typst_for_element(element, template, assets, references)
                    .unwrap_or_else(|| legacy_table_preview_body(table));
            seeds.push(ResourceSeed {
                id: table.id.clone(),
                kind: ResourceKind::Table,
                label: "Table".to_string(),
                subtitle: Some(format!("{} x {}", table.rows, table.cols)),
                reference_token: reference_token(&table.id),
                source_element_id: Some(table.id.clone()),
                asset_id: None,
                preview_source: Some(preview_body),
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
            let preview_body =
                resource_preview_typst_for_element(element, template, assets, references)
                    .unwrap_or_else(|| legacy_figure_preview_body(asset_ref));
            seeds.push(ResourceSeed {
                id: figure.id.clone(),
                kind: ResourceKind::Figure,
                label,
                subtitle: asset_ref.map(|a| a.path.clone()),
                reference_token: reference_token(&figure.id),
                source_element_id: Some(figure.id.clone()),
                asset_id: figure.asset_id.clone(),
                preview_source: Some(preview_body),
                preview_page: None,
                missing_diagnostic: None,
            });
            collect_element_seeds(&figure.content, seeds, assets, template, references);
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
                preview_source: Some(body),
                preview_page: None,
                missing_diagnostic: None,
            });
        }
        DocumentElement::Heading(_)
        | DocumentElement::Paragraph(_)
        | DocumentElement::Quote(_)
        | DocumentElement::List(_)
        | DocumentElement::Enumeration(_) => {}
    }
}

fn rich_text_plain_text(content: &[crate::ast::RichText]) -> String {
    content.iter().map(|span| span.text.as_str()).collect()
}

fn legacy_table_preview_body(table: &crate::ast::Table) -> String {
    let columns = if table.column_sizes.is_empty() {
        "1fr".to_string()
    } else {
        table.column_sizes.join(", ")
    };
    let mut body = format!("#table(\n  columns: ({columns})");
    for row in &table.cells {
        for cell in row {
            body.push_str(",\n  [");
            let cell_text = cell
                .elements
                .iter()
                .map(|element| match element {
                    crate::ast::DocumentElement::Paragraph(p) => rich_text_plain_text(&p.content),
                    crate::ast::DocumentElement::Quote(q) => rich_text_plain_text(&q.content),
                    _ => String::new(),
                })
                .collect::<Vec<_>>()
                .join("\n\n");
            body.push_str(&escape_typst(&cell_text));
            body.push(']');
        }
    }
    body.push_str("\n)");
    body
}

fn legacy_figure_preview_body(asset_ref: Option<&AssetEntry>) -> String {
    asset_ref
        .map(|a| format!("#image(\"{}\", width: 100%)", escape_typst_string(&a.path)))
        .unwrap_or_else(|| "[Figure]".to_string())
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

fn reference_token(id: &str) -> String {
    format!("@ergo-{}", path_id_for_id(id))
}

fn write_if_changed(vfs: &VirtualFileSystem, path: &str, source: &str) {
    if !vfs.is_source_equal(path, source) {
        vfs.write_source(path, source.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{AssetEntry, DocumentElement, DocumentSection, Figure};
    use crate::document_resources::resource_preview_lib_source;
    use crate::template_spec::load_bundled_template;
    use crate::test_fixtures::basic_document_ast;

    #[test]
    fn resource_preview_figure_document_uses_project_paper_width_and_hugs_height() {
        use std::sync::Arc;

        use crate::compile_artifacts::compile_document;
        use crate::path_utils::file_id_for_virtual_path;
        use crate::test_fixtures::populate_versatile_apa;
        use crate::world::ErgoWorld;

        let mut ast = basic_document_ast("Title", "");
        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Figure(Box::new(Figure {
            id: "figure-1".to_string(),
            asset_id: None,
            caption: "A figure".to_string(),
            placement: "here".to_string(),
            content: DocumentElement::Paragraph(crate::ast::Paragraph {
                id: "figure-1-body".to_string(),
                content: vec![],
            }),
            extra_fields: std::collections::HashMap::new(),
        })));

        let template = load_bundled_template("apa7").unwrap();
        let vfs = Arc::new(VirtualFileSystem::new());
        populate_versatile_apa(&vfs);
        let lib = resource_preview_lib_source(&ast, &template);
        write_resource_files(&vfs, &ast, &template, &lib);

        let world = ErgoWorld::new(
            Arc::clone(&vfs),
            file_id_for_virtual_path(RESOURCE_WATCH_MAIN),
        );
        let document = compile_document(&world).expect("figure resource preview should compile");
        let page = &document.pages[0];
        let width_pt = page.frame.size().x.to_pt();
        let height_pt = page.frame.size().y.to_pt();
        assert!(
            (600.0..=625.0).contains(&width_pt),
            "figure preview page should match project paper width, got {width_pt}pt"
        );
        assert!(
            height_pt < 300.0,
            "figure preview page should hug content height, got {height_pt}pt"
        );
    }

    #[test]
    fn file_assets_are_not_included_in_resource_catalog() {
        let mut ast = basic_document_ast("Title", "");
        ast.assets.push(AssetEntry {
            id: "unlinked-asset".to_string(),
            path: "assets/unlinked.png".to_string(),
            kind: "image".to_string(),
            caption: None,
        });
        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Figure(Box::new(Figure {
            id: "figure-1".to_string(),
            asset_id: None,
            caption: "A figure".to_string(),
            placement: "here".to_string(),
            content: DocumentElement::Paragraph(crate::ast::Paragraph {
                id: "figure-1-body".to_string(),
                content: vec![],
            }),
            extra_fields: std::collections::HashMap::new(),
        })));

        let template = load_bundled_template("apa7").unwrap();
        let vfs = VirtualFileSystem::new();
        let catalog = build_resource_catalog(&ast, &template, &vfs);

        assert!(catalog.groups.iter().all(|group| {
            group
                .entries
                .iter()
                .all(|entry| entry.id != "unlinked-asset")
        }));
    }

    #[test]
    fn diagrams_are_grouped_with_figures() {
        use crate::ast::Diagram;

        let mut ast = basic_document_ast("Title", "");
        ast.assets.push(AssetEntry {
            id: "diagram-1".to_string(),
            path: "assets/diagrams/diagram-1.svg".to_string(),
            kind: "image".to_string(),
            caption: None,
        });
        let DocumentSection::Content(content) = &mut ast.sections[0];
        content.elements.push(DocumentElement::Diagram(Diagram {
            id: "diagram-1".to_string(),
            mermaid_source: "flowchart TD\nA-->B".to_string(),
            asset_id: Some("diagram-1".to_string()),
            caption: "Flow".to_string(),
            placement: "here".to_string(),
            extra_fields: std::collections::HashMap::new(),
        }));

        let template = load_bundled_template("apa7").unwrap();
        let vfs = VirtualFileSystem::new();
        let catalog = build_resource_catalog(&ast, &template, &vfs);

        assert!(catalog
            .groups
            .iter()
            .all(|group| group.kind != ResourceKind::Diagram));
        let figures = catalog
            .groups
            .iter()
            .find(|group| group.kind == ResourceKind::Figure)
            .expect("figures group exists");
        assert!(figures.entries.iter().any(|entry| entry.id == "diagram-1"));
    }
}
