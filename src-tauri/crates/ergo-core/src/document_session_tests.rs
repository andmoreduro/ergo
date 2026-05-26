use super::*;
use crate::ast::{
    AssetEntry, DocumentElement, DocumentSection, Equation, Figure, Paragraph, ProjectSettings,
    ReferenceEntry, RichText, Table, TableCell,
};
use crate::test_fixtures::basic_document_ast;

fn rich_text(text: &str) -> Vec<RichText> {
    vec![RichText {
        text: text.to_string(),
        bold: None,
        italic: None,
        kind: None,
        reference_id: None,
        equation_source: None,
    }]
}

fn persisted_ast(vfs: &VirtualFileSystem) -> DocumentAST {
    serde_json::from_str(&vfs.read_source(DOCUMENT_STATE_PATH).unwrap()).unwrap()
}

#[test]
fn generates_main_and_section_files() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));

    let status = session
        .sync_snapshot(basic_document_ast("Título con ñ", ""))
        .unwrap();

    assert_eq!(status.layout.main_path, "main.typ");
    assert_eq!(status.layout.section_paths.len(), 1);
    assert!(vfs.read_source("main.typ").unwrap().contains("#import"));
    assert!(vfs
        .read_source("elements/heading-1.typ")
        .unwrap()
        .contains("#heading(level: 2, [Introducción]) <ergo-heading-1>"));
    assert!(status.source_map.iter().any(
        |entry| entry.element_id == "heading-1" && entry.file_path == "elements/heading-1.typ"
    ));
}

#[test]
fn generates_compile_safe_defaults_for_empty_template_inputs() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = basic_document_ast("Título con ñ", "");
    ast.inputs
        .insert("keywords".to_string(), serde_json::json!([]));

    session.sync_snapshot(ast).unwrap();

    let main_source = vfs.read_source("main.typ").unwrap();
    let lib_source = vfs.read_source("lib.typ").unwrap();
    assert!(!lib_source.contains("running-head:"));
    assert!(main_source.contains("authors:"));
    assert!(main_source.contains("Authors"));
    assert!(main_source.contains("affiliations: (:)"));
    assert!(main_source.contains("keywords: ()"));
    assert!(lib_source.contains("#set text(font: \"Libertinus Serif\", size: 11pt)"));
    assert!(!lib_source.contains("#set text(font: \"DejaVu Sans Mono\")"));
}

#[test]
fn field_source_map_tracks_template_input_collection_paths() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = basic_document_ast("Título con ñ", "");
    ast.inputs.insert(
        "affiliations".to_string(),
        serde_json::json!(["Universidad Norte"]),
    );
    ast.inputs.insert(
        "authors".to_string(),
        serde_json::json!([
            {
                "name": "Ada Lovelace",
                "affiliations": ["1"]
            }
        ]),
    );

    let status = session.sync_snapshot(ast).unwrap();

    for field_id in [
        "/authors/0/name",
        "/authors/0/affiliations/0",
        "/affiliations/0",
    ] {
        assert!(
            status.field_source_map.iter().any(|entry| {
                entry.element_id == "inputs"
                    && entry.field_id == field_id
                    && entry.file_path == "main.typ"
            }),
            "missing field source map entry for {field_id}",
        );
    }
}

#[test]
fn field_source_map_tracks_template_preamble_input_paths() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = basic_document_ast("Título con ñ", "");
    ast.metadata.template_variant_id = Some("professional".to_string());
    ast.inputs
        .insert("running_head".to_string(), serde_json::json!("CABEZA"));

    let status = session.sync_snapshot(ast).unwrap();

    for field_id in ["/title", "/running_head"] {
        let expected_file = if field_id == "/title" {
            "main.typ"
        } else {
            "lib.typ"
        };
        assert!(
            status.field_source_map.iter().any(|entry| {
                entry.element_id == "inputs"
                    && entry.field_id == field_id
                    && entry.file_path == expected_file
                    && !entry.segments.is_empty()
            }),
            "missing preamble field source map entry for {field_id}",
        );
    }
}

#[test]
fn title_input_events_update_project_metadata_source() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    session
        .sync_snapshot(basic_document_ast("Borrador inicial", ""))
        .unwrap();

    session
        .apply_event(DocumentEvent::UpdateInput {
            path: "/title".to_string(),
            value: serde_json::json!("Título escrito"),
        })
        .unwrap();

    let persisted = persisted_ast(&vfs);
    let main_source = vfs.read_source("main.typ").unwrap();

    assert_eq!(persisted.metadata.title, "Título escrito");
    assert_eq!(
        persisted.inputs.get("title"),
        Some(&serde_json::json!("Título escrito"))
    );
    assert!(main_source.contains("#set document(title: [Título escrito]"));
}

#[test]
fn status_includes_field_source_map_for_heading_text() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));

    let status = session
        .sync_snapshot(basic_document_ast("Título con ñ", ""))
        .unwrap();
    let status_json = serde_json::to_value(status).unwrap();
    let field_map = status_json
        .get("fieldSourceMap")
        .and_then(serde_json::Value::as_array)
        .unwrap_or_else(|| panic!("fieldSourceMap missing from document session status"));

    assert!(field_map.iter().any(|entry| {
        entry.get("elementId") == Some(&serde_json::json!("heading-1"))
            && entry.get("fieldId") == Some(&serde_json::json!("heading-1:text"))
            && entry.get("filePath") == Some(&serde_json::json!("elements/heading-1.typ"))
    }));
}

#[test]
fn field_source_map_tracks_escaped_text_and_utf16_offsets() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = basic_document_ast("Título con ñ", "");

    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        if let DocumentElement::Heading(heading) = &mut content.elements[0] {
            heading.content[0].text = "#Niñez 🌍".to_string();
        }
    }

    let status = session.sync_snapshot(ast).unwrap();
    let field_entry = status
        .field_source_map
        .iter()
        .find(|entry| entry.field_id == "heading-1:text")
        .unwrap();

    assert_eq!(
        vfs.read_source("elements/heading-1.typ").unwrap(),
        "#heading(level: 2, [\\#Niñez 🌍]) <ergo-heading-1>\n\n"
    );
    assert_eq!(
        field_entry
            .segments
            .last()
            .map(|segment| segment.field_utf16_end),
        Some("#Niñez 🌍".encode_utf16().count())
    );
}

#[test]
fn reads_preview_svg_from_generated_file_storage() {
    let vfs = VirtualFileSystem::new();
    vfs.write_file(
        ".ergproj/preview/svg/page-1.svg",
        "<svg>Vista previa ñ</svg>".as_bytes().to_vec(),
    );

    let svg = read_preview_svg_from_vfs(&vfs, ".ergproj/preview/svg/page-1.svg").unwrap();

    assert_eq!(svg, "<svg>Vista previa ñ</svg>");
}

#[test]
fn marks_only_changed_section_dirty_on_text_edit() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = basic_document_ast("Título con ñ", "");
    session.sync_snapshot(ast.clone()).unwrap();

    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        if let DocumentElement::Heading(heading) = &mut content.elements[0] {
            heading.content[0].text = "Método".to_string();
        }
    }

    let status = session.sync_snapshot(ast).unwrap();

    assert_eq!(status.dirty_element_ids, vec!["heading-1"]);
    assert_eq!(status.dirty_element_ids, vec!["heading-1"]);
    assert!(vfs
        .read_source("elements/heading-1.typ")
        .unwrap()
        .contains("Método"));
}

#[test]
fn applies_paragraph_text_events_in_sequence() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = basic_document_ast("Título con ñ", "");
    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        content.elements.push(DocumentElement::Paragraph(Paragraph {
            id: "paragraph-1".to_string(),
            content: vec![],
        }));
    }
    session.sync_snapshot(ast).unwrap();

    for index in 1..=10 {
        let status = session
            .apply_event(DocumentEvent::UpdateParagraphText {
                element_id: "paragraph-1".to_string(),
                text: format!("Paso {index} con ñ"),
            })
            .unwrap();
        assert!(status
            .dirty_element_ids
            .iter()
            .any(|element_id| element_id == "paragraph-1"),);
    }

    let source = vfs.read_source("elements/paragraph-1.typ").unwrap();
    let state_json = vfs.read_source(".ergproj/document_state.json").unwrap();

    assert!(source.contains("Paso 10 con ñ"));
    assert!(!source.contains("Paso 9 con ñ"));
    assert!(state_json.contains("Paso 10 con ñ"));
}

#[test]
fn applies_document_event_variants_to_backend_ast() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    session
        .sync_snapshot(basic_document_ast("Título con ñ", ""))
        .unwrap();

    session
        .apply_event(DocumentEvent::SetProjectSettings {
            settings: ProjectSettings {
                language: Some("es".to_string()),
                ..ProjectSettings::default()
            },
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateInput {
            path: "/abstract_text".to_string(),
            value: serde_json::json!("Resumen con ñ"),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateInput {
            path: "/affiliations".to_string(),
            value: serde_json::json!(["Universidad"]),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateInput {
            path: "/authors".to_string(),
            value: serde_json::json!([
                { "name": "Ana" }
            ]),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::InsertElement {
            section_id: "content-section".to_string(),
            index: 1,
            element: Box::new(DocumentElement::Paragraph(Paragraph {
                id: "paragraph-1".to_string(),
                content: rich_text("Borrador"),
            })),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateParagraphText {
            element_id: "paragraph-1".to_string(),
            text: "Texto con #, ñ y 🌍".to_string(),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateHeading {
            element_id: "heading-1".to_string(),
            text: Some("Método".to_string()),
            level: Some(3),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::InsertElement {
            section_id: "content-section".to_string(),
            index: 2,
            element: Box::new(DocumentElement::Equation(Equation {
                id: "equation-1".to_string(),
                latex_source: "x".to_string(),
                is_block: true,
            })),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateEquation {
            element_id: "equation-1".to_string(),
            latex_source: Some("x^2".to_string()),
            is_block: Some(false),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::InsertElement {
            section_id: "content-section".to_string(),
            index: 3,
            element: Box::new(DocumentElement::Table(Table {
                id: "table-1".to_string(),
                rows: 1,
                cols: 1,
                cells: vec![vec![TableCell {
                    content: "A".to_string(),
                    row_span: None,
                    col_span: None,
                }]],
                column_sizes: vec!["1fr".to_string()],
                extra_fields: std::collections::HashMap::new(),
            })),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::InsertTableRow {
            table_id: "table-1".to_string(),
            row_index: 1,
            cells: vec![TableCell {
                content: "B".to_string(),
                row_span: None,
                col_span: None,
            }],
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateTableCell {
            table_id: "table-1".to_string(),
            row_index: 1,
            col_index: 0,
            text: "Celda".to_string(),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::InsertTableColumn {
            table_id: "table-1".to_string(),
            col_index: 1,
            cells: vec![
                TableCell {
                    content: "C".to_string(),
                    row_span: None,
                    col_span: None,
                },
                TableCell {
                    content: "D".to_string(),
                    row_span: None,
                    col_span: None,
                },
            ],
            size: "2fr".to_string(),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateTableColumnSize {
            table_id: "table-1".to_string(),
            col_index: 1,
            size: "3fr".to_string(),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::RestoreTableRow {
            table_id: "table-1".to_string(),
            row_index: 2,
            cells: vec![
                TableCell {
                    content: "E".to_string(),
                    row_span: None,
                    col_span: None,
                },
                TableCell {
                    content: "F".to_string(),
                    row_span: None,
                    col_span: None,
                },
            ],
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::RemoveTableRow {
            table_id: "table-1".to_string(),
            row_index: 2,
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::RestoreTableColumn {
            table_id: "table-1".to_string(),
            col_index: 2,
            cells: vec![
                TableCell {
                    content: "G".to_string(),
                    row_span: None,
                    col_span: None,
                },
                TableCell {
                    content: "H".to_string(),
                    row_span: None,
                    col_span: None,
                },
            ],
            size: "auto".to_string(),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::RemoveTableColumn {
            table_id: "table-1".to_string(),
            col_index: 2,
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::InsertElement {
            section_id: "content-section".to_string(),
            index: 4,
            element: Box::new(DocumentElement::Figure(Box::new(Figure {
                id: "figure-1".to_string(),
                asset_id: None,
                content: DocumentElement::Paragraph(Paragraph {
                    id: "figure-body".to_string(),
                    content: rich_text("Cuerpo"),
                }),
                caption: "Figura".to_string(),
                placement: "auto".to_string(),
                extra_fields: std::collections::HashMap::new(),
            }))),
        })
        .unwrap();
    session
        .apply_event(DocumentEvent::UpdateFigure {
            element_id: "figure-1".to_string(),
            caption: Some("Figura con ñ".to_string()),
            placement: Some("top".to_string()),
            body_text: Some("Contenido de figura".to_string()),
            asset_id: None,
        })
        .unwrap();

    let ast = persisted_ast(&vfs);

    assert_eq!(
        ast.metadata.project_settings.language.as_deref(),
        Some("es")
    );
    assert_eq!(
        ast.inputs.get("abstract_text").and_then(|v| v.as_str()),
        Some("Resumen con ñ")
    );
    assert_eq!(
        ast.inputs.get("affiliations"),
        Some(&serde_json::json!(["Universidad"]))
    );
    assert_eq!(
        ast.inputs.get("authors"),
        Some(&serde_json::json!([
            { "name": "Ana" }
        ]))
    );

    match &ast.sections[0] {
        DocumentSection::Content(content) => {
            assert_eq!(content.elements.len(), 5);
            match &content.elements[0] {
                DocumentElement::Heading(heading) => {
                    assert_eq!(heading.level, 3);
                    assert_eq!(heading.content[0].text, "Método");
                }
                _ => panic!("heading missing"),
            }
            match &content.elements[1] {
                DocumentElement::Paragraph(paragraph) => {
                    assert_eq!(paragraph.content[0].text, "Texto con #, ñ y 🌍");
                }
                _ => panic!("paragraph missing"),
            }
            match &content.elements[2] {
                DocumentElement::Equation(equation) => {
                    assert_eq!(equation.latex_source, "x^2");
                    assert!(!equation.is_block);
                }
                _ => panic!("equation missing"),
            }
            match &content.elements[3] {
                DocumentElement::Table(table) => {
                    assert_eq!(table.rows, 2);
                    assert_eq!(table.cols, 2);
                    assert_eq!(table.cells[1][0].content, "Celda");
                    assert_eq!(table.column_sizes[1], "3fr");
                }
                _ => panic!("table missing"),
            }
            match &content.elements[4] {
                DocumentElement::Figure(figure) => {
                    assert_eq!(figure.caption, "Figura con ñ");
                    assert_eq!(figure.placement, "top");
                }
                _ => panic!("figure missing"),
            }
        }
        _ => panic!("content section missing"),
    }
}

#[test]
fn restore_element_round_trips_removed_content() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let ast = basic_document_ast("Título con ñ", "");
    let removed = match &ast.sections[0] {
        DocumentSection::Content(content) => content.elements[0].clone(),
    };
    session.sync_snapshot(ast).unwrap();

    session
        .apply_event(DocumentEvent::RemoveElement {
            element_id: "heading-1".to_string(),
        })
        .unwrap();
    assert!(vfs.read_source("elements/heading-1.typ").is_err());

    session
        .apply_event(DocumentEvent::RestoreElement {
            section_id: "content-section".to_string(),
            index: 0,
            element: Box::new(removed),
        })
        .unwrap();
    assert!(vfs
        .read_source("elements/heading-1.typ")
        .unwrap()
        .contains("Introducción"));
}

#[test]
fn impossible_restore_element_does_not_mutate_document() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let ast = basic_document_ast("Título con ñ", "");
    let removed = match &ast.sections[0] {
        DocumentSection::Content(content) => content.elements[0].clone(),
    };
    session.sync_snapshot(ast).unwrap();

    let error = session
        .apply_event(DocumentEvent::RestoreElement {
            section_id: "content-section".to_string(),
            index: 99,
            element: Box::new(removed),
        })
        .unwrap_err();

    assert!(error.contains("restore element"));
    assert!(vfs
        .read_source("elements/heading-1.typ")
        .unwrap()
        .contains("Introducción"));
}

#[test]
fn writes_references_bib_from_reference_entries() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    let mut ast = basic_document_ast("Título con ñ", "");
    ast.references.push(ReferenceEntry {
        id: "ref-1".to_string(),
        citation_key: "garcia2024".to_string(),
        biblatex: "@article{garcia2024,\n  title = {Niñez}\n}".to_string(),
    });

    session.sync_snapshot(ast).unwrap();

    assert!(vfs
        .read_source("references.bib")
        .unwrap()
        .contains("@article{garcia2024"));
    assert!(vfs
        .read_source("main.typ")
        .unwrap()
        .contains("#bibliography(\"references.bib\", full: true"));
}

#[test]
fn applies_reference_events_to_references_bib() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    session
        .sync_snapshot(basic_document_ast("Título con ñ", ""))
        .unwrap();

    session
        .apply_event(DocumentEvent::InsertReference {
            index: 0,
            reference: ReferenceEntry {
                id: "ref-1".to_string(),
                citation_key: "garcia2024".to_string(),
                biblatex: "@article{garcia2024,\n  title = {Niñez}\n}".to_string(),
            },
        })
        .unwrap();

    assert!(vfs
        .read_source("references.bib")
        .unwrap()
        .contains("@article{garcia2024"));

    session
        .apply_event(DocumentEvent::UpdateReference {
            reference: ReferenceEntry {
                id: "ref-1".to_string(),
                citation_key: "garcia2025".to_string(),
                biblatex: "@book{garcia2025,\n  title = {Libro}\n}".to_string(),
            },
        })
        .unwrap();

    let updated_source = vfs.read_source("references.bib").unwrap();
    assert!(updated_source.contains("@book{garcia2025"));
    assert!(!updated_source.contains("@article{garcia2024"));

    session
        .apply_event(DocumentEvent::RemoveReference {
            reference_id: "ref-1".to_string(),
        })
        .unwrap();

    assert_eq!(vfs.read_source("references.bib").unwrap(), "");
}

#[test]
fn applies_asset_events_to_document_state() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));
    session
        .sync_snapshot(basic_document_ast("Título con ñ", ""))
        .unwrap();

    session
        .apply_event(DocumentEvent::InsertAsset {
            index: 0,
            asset: crate::ast::AssetEntry {
                id: "asset-1".to_string(),
                path: "assets/chart.png".to_string(),
                kind: "image".to_string(),
                caption: Some("Chart".to_string()),
            },
        })
        .unwrap();

    assert_eq!(persisted_ast(&vfs).assets.len(), 1);

    session
        .apply_event(DocumentEvent::UpdateAsset {
            asset: crate::ast::AssetEntry {
                id: "asset-1".to_string(),
                path: "assets/chart.png".to_string(),
                kind: "image".to_string(),
                caption: Some("Updated chart".to_string()),
            },
        })
        .unwrap();

    assert_eq!(
        persisted_ast(&vfs).assets[0].caption.as_deref(),
        Some("Updated chart")
    );

    session
        .apply_event(DocumentEvent::RemoveAsset {
            asset_id: "asset-1".to_string(),
        })
        .unwrap();

    assert!(persisted_ast(&vfs).assets.is_empty());
}

#[test]
fn test_incremental_dirty_resource_tracking() {
    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));

    let mut ast = basic_document_ast("Title", "");

    let eq = Equation {
        id: "eq-1".to_string(),
        latex_source: "E = mc^2".to_string(),
        is_block: true,
    };
    let fig = Figure {
        id: "fig-1".to_string(),
        asset_id: Some("asset-1".to_string()),
        content: DocumentElement::Paragraph(Paragraph {
            id: "fig-1-body".to_string(),
            content: rich_text("Figure Body"),
        }),
        caption: "Figure Caption".to_string(),
        placement: "h".to_string(),
        extra_fields: std::collections::HashMap::new(),
    };
    let asset = AssetEntry {
        id: "asset-1".to_string(),
        path: "chart.png".to_string(),
        kind: "image".to_string(),
        caption: None,
    };

    ast.assets.push(asset.clone());

    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        content.elements.push(DocumentElement::Equation(eq));
        content
            .elements
            .push(DocumentElement::Figure(Box::new(fig)));
    }

    let status = session.sync_snapshot(ast.clone()).unwrap();
    assert!(status.dirty_resource_ids.contains(&"eq-1".to_string()));
    assert!(status.dirty_resource_ids.contains(&"fig-1".to_string()));
    assert!(status.dirty_resource_ids.contains(&"asset-1".to_string()));

    let status_event = session
        .apply_event(DocumentEvent::UpdateEquation {
            element_id: "eq-1".to_string(),
            latex_source: Some("F = ma".to_string()),
            is_block: None,
        })
        .unwrap();

    assert!(status_event
        .dirty_resource_ids
        .contains(&"eq-1".to_string()));
    assert!(!status_event
        .dirty_resource_ids
        .contains(&"fig-1".to_string()));
    assert!(!status_event
        .dirty_resource_ids
        .contains(&"asset-1".to_string()));

    let mut updated_ast = session.ast().unwrap();
    updated_ast.assets[0].caption = Some("New Caption".to_string());

    let status_sync = session.sync_snapshot(updated_ast).unwrap();
    assert!(status_sync
        .dirty_resource_ids
        .contains(&"asset-1".to_string()));
    assert!(status_sync
        .dirty_resource_ids
        .contains(&"fig-1".to_string()));
    assert!(!status_sync.dirty_resource_ids.contains(&"eq-1".to_string()));
}

#[test]
fn compiles_apa_document_with_table_and_paragraph_edit() {
    use crate::compile_artifacts::compile_document;
    use crate::package_resolver::{collect_package_files, PackageRef};
    use crate::path_utils::file_id_for_virtual_path;
    use crate::world::ErgoWorld;

    let package = PackageRef::from_import("@preview/versatile-apa", "7.2.0").unwrap();
    let package_files = match collect_package_files(&package) {
        Ok(files) => files,
        Err(error) => {
            eprintln!("skipping compile test: {error}");
            return;
        }
    };

    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));

    let mut ast = basic_document_ast("Compile test", "");
    ast.metadata.template_id = "versatile-apa".to_string();
    ast.metadata.template_variant_id = Some("student".to_string());
    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        content.elements.push(DocumentElement::Paragraph(Paragraph {
            id: "paragraph-1".to_string(),
            content: rich_text("Before"),
        }));
        content.elements.push(DocumentElement::Table(Table {
            id: "table-1".to_string(),
            rows: 2,
            cols: 2,
            cells: vec![
                vec![
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
                ],
                vec![
                    TableCell {
                        content: "C".to_string(),
                        row_span: None,
                        col_span: None,
                    },
                    TableCell {
                        content: "D".to_string(),
                        row_span: None,
                        col_span: None,
                    },
                ],
            ],
            column_sizes: vec!["1fr".to_string(), "1fr".to_string()],
            extra_fields: std::collections::HashMap::new(),
        }));
    }

    for file in package_files {
        vfs.write_file(&file.path, file.bytes);
    }

    session.sync_snapshot(ast.clone()).unwrap();
    let main_source = vfs.read_source("main.typ").unwrap();
    assert!(
        main_source.contains("apa-figure"),
        "main.typ should import apa-figure; got:\n{main_source}"
    );
    let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
    let err = compile_document(&world).err();
    assert!(
        err.is_none(),
        "initial compile failed: {}",
        err.map(|e| e.to_string()).unwrap_or_default()
    );

    session
        .apply_event(DocumentEvent::UpdateParagraphText {
            element_id: "paragraph-1".to_string(),
            text: "After".to_string(),
        })
        .unwrap();

    let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
    let err = compile_document(&world).err();
    assert!(
        err.is_none(),
        "compile after paragraph edit failed: {}",
        err.map(|e| e.to_string()).unwrap_or_default()
    );

    let table_source = vfs.read_source("elements/table-1.typ").unwrap();
    assert!(table_source.contains("#apa-figure("));
}

#[test]
fn compiles_apa_figure_with_linked_image_asset() {
    use crate::compile_artifacts::compile_document;
    use crate::package_resolver::{collect_package_files, PackageRef};
    use crate::path_utils::file_id_for_virtual_path;
    use crate::world::ErgoWorld;

    let package = PackageRef::from_import("@preview/versatile-apa", "7.2.0").unwrap();
    let package_files = match collect_package_files(&package) {
        Ok(files) => files,
        Err(error) => {
            eprintln!("skipping compile test (package not cached): {error}");
            return;
        }
    };

    let vfs = Arc::new(VirtualFileSystem::new());
    let session = DocumentSession::new(Arc::clone(&vfs));

    let png_bytes: Vec<u8> = {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"\x89PNG\r\n\x1a\n");
        buf.extend_from_slice(&[0, 0, 0, 13]); // IHDR length
        buf.extend_from_slice(b"IHDR");
        buf.extend_from_slice(&1u32.to_be_bytes()); // width
        buf.extend_from_slice(&1u32.to_be_bytes()); // height
        buf.push(8); // bit depth
        buf.push(2); // color type RGB
        buf.extend_from_slice(&[0, 0, 0]); // compression, filter, interlace
        let ihdr_data = &buf[12..]; // IHDR content
        let crc = crc32_simple(b"IHDR", &ihdr_data[4..]);
        buf.extend_from_slice(&crc.to_be_bytes());
        // IDAT
        let raw_row: Vec<u8> = vec![0, 255, 0, 0]; // filter=0, R, G, B
        let mut deflated = Vec::new();
        deflated.push(0x78); // zlib header
        deflated.push(0x01);
        let mut adler = Adler32::new();
        adler.update(&raw_row);
        // deflate stored block
        deflated.push(0x01); // BFINAL=1, BTYPE=00
        let len = raw_row.len() as u16;
        deflated.extend_from_slice(&len.to_le_bytes());
        deflated.extend_from_slice(&(!len).to_le_bytes());
        deflated.extend_from_slice(&raw_row);
        let (s1, s2) = adler.finish();
        deflated.extend_from_slice(&((s2 as u32) << 16 | s1 as u32).to_be_bytes());
        let idat_crc = crc32_simple(b"IDAT", &deflated);
        buf.extend_from_slice(&(deflated.len() as u32).to_be_bytes());
        buf.extend_from_slice(b"IDAT");
        buf.extend_from_slice(&deflated);
        buf.extend_from_slice(&idat_crc.to_be_bytes());
        // IEND
        let iend_crc = crc32_simple(b"IEND", &[]);
        buf.extend_from_slice(&0u32.to_be_bytes());
        buf.extend_from_slice(b"IEND");
        buf.extend_from_slice(&iend_crc.to_be_bytes());
        buf
    };

    vfs.write_file("assets/photo.png", png_bytes);

    let mut ast = basic_document_ast("Figure image test", "");
    ast.metadata.template_id = "versatile-apa".to_string();
    ast.metadata.template_variant_id = Some("student".to_string());
    ast.assets.push(AssetEntry {
        id: "asset-1".to_string(),
        path: "assets/photo.png".to_string(),
        kind: "image".to_string(),
        caption: None,
    });
    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        content
            .elements
            .push(DocumentElement::Figure(Box::new(Figure {
                id: "figure-1".to_string(),
                asset_id: Some("asset-1".to_string()),
                content: DocumentElement::Paragraph(Paragraph {
                    id: "figure-1-body".to_string(),
                    content: vec![],
                }),
                caption: "Test image".to_string(),
                placement: "auto".to_string(),
                extra_fields: std::collections::HashMap::new(),
            })));
    }

    for file in package_files {
        vfs.write_file(&file.path, file.bytes);
    }

    session.sync_snapshot(ast).unwrap();

    let figure_source = vfs.read_source("elements/figure-1.typ").unwrap();
    assert!(
        figure_source.contains("image(\"../assets/photo.png\")"),
        "figure element must reference asset with path relative to elements/ dir; got:\n{figure_source}"
    );

    assert!(
        vfs.read_file("assets/photo.png").is_ok(),
        "asset file must exist in VFS at assets/photo.png"
    );

    let main_source = vfs.read_source("main.typ").unwrap();
    assert!(
        main_source.contains("#include \"elements/figure-1.typ\""),
        "main.typ must include the figure element file; got:\n{main_source}"
    );

    let world = ErgoWorld::new(Arc::clone(&vfs), file_id_for_virtual_path("main.typ"));
    let err = compile_document(&world).err();
    assert!(
        err.is_none(),
        "compile with figure+image failed: {}",
        err.map(|e| e.to_string()).unwrap_or_default()
    );
}

fn crc32_simple(chunk_type: &[u8], data: &[u8]) -> u32 {
    let mut crc: u32 = 0xFFFF_FFFF;
    for &byte in chunk_type.iter().chain(data.iter()) {
        crc ^= byte as u32;
        for _ in 0..8 {
            if crc & 1 != 0 {
                crc = (crc >> 1) ^ 0xEDB8_8320;
            } else {
                crc >>= 1;
            }
        }
    }
    crc ^ 0xFFFF_FFFF
}

struct Adler32 {
    s1: u16,
    s2: u16,
}
impl Adler32 {
    fn new() -> Self {
        Self { s1: 1, s2: 0 }
    }
    fn update(&mut self, data: &[u8]) {
        for &byte in data {
            self.s1 = (self.s1.wrapping_add(byte as u16)) % 65521;
            self.s2 = (self.s2.wrapping_add(self.s1)) % 65521;
        }
    }
    fn finish(&self) -> (u16, u16) {
        (self.s1, self.s2)
    }
}
