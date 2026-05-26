use super::*;
use crate::ast::{
    AssetEntry, ContentSection, CustomElement, DependencyManifest, DocumentElement,
    DocumentSection, GlobalSettings, ProjectMetadata, ProjectSettings, ReferenceEntry, RichText,
};
use crate::ast::{Figure, Paragraph, Table, TableCell};
use crate::document_source_builder::SourceBuilder;
use crate::template_spec::{
    CustomElementSpec, ElementOverrideSpec, ElementOverrides, ExtraFieldSpec, InputGroupSpec,
    PackageSpec, ParamSpec, ParamType, SectionSpec, ShowRuleSpec, TemplateIdentity,
};
use serde_json::json;

#[test]
fn bibliography_references_emit_citation_key_not_element_label() {
    let references = vec![ReferenceEntry {
        id: "bib-ref-1".to_string(),
        citation_key: "bib-ref-1".to_string(),
        biblatex: "@article{bib-ref-1, title = {Demo}}".to_string(),
    }];
    let bibliography_keys = bibliography_citation_keys(&references);
    let mut builder = SourceBuilder::default();
    let content = vec![RichText {
        text: "See ".to_string(),
        bold: None,
        italic: None,
        kind: Some("reference".to_string()),
        reference_id: Some("bib-ref-1".to_string()),
        equation_source: None,
    }];

    push_rich_text_field(
        &mut builder,
        "paragraph-1",
        "paragraph-1:text",
        &content,
        &bibliography_keys,
    );

    assert!(builder.source.contains("@bib-ref-1"));
    assert!(!builder.source.contains("@ergo-bib-ref-1"));
}

#[test]
fn element_references_keep_ergo_label_tokens() {
    let bibliography_keys = HashMap::new();
    assert_eq!(
        typst_reference_marker("equation-1", &bibliography_keys),
        "@ergo-equation-1"
    );
}

fn custom_element_template(field: ParamSpec) -> TemplateSpec {
    TemplateSpec {
        template: TemplateIdentity {
            id: "test-template".to_string(),
            name: "Test Template".to_string(),
            version: "1.0.0".to_string(),
            description: None,
        },
        package: PackageSpec {
            name: "@preview/test".to_string(),
            version: "1.0.0".to_string(),
            imports: vec![],
            dependencies: vec![],
        },
        variants: vec![],
        show_rule: Some(ShowRuleSpec {
            function: "apply".to_string(),
            params: vec![],
            variants: None,
        }),
        inputs: vec![],
        groups: Vec::<InputGroupSpec>::new(),
        custom_elements: vec![CustomElementSpec {
            kind: "callout".to_string(),
            label: "Callout".to_string(),
            description: None,
            function: "callout".to_string(),
            fields: vec![field],
        }],
        sections: vec![SectionSpec {
            id: "body".to_string(),
            kind: SectionKind::Content,
            label: None,
            function: None,
            params: vec![],
            variants: None,
            source: None,
            file: None,
            title: None,
            show_rule: None,
            editable: None,
            pagebreak_before: false,
        }],
        element_overrides: None,
        resource_policy: None,
        defaults: None,
    }
}

fn ast_with_custom_field(key: &str, value: serde_json::Value) -> DocumentAST {
    let mut fields = HashMap::new();
    fields.insert(key.to_string(), value);

    DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "test-template".to_string(),
            template_variant_id: None,
            title: "Custom".to_string(),
            running_head: None,
            keywords: vec![],
            project_settings: ProjectSettings::default(),
            local_overrides: GlobalSettings::default(),
        },
        dependencies: DependencyManifest { packages: vec![] },
        references: vec![],
        assets: vec![],
        inputs: HashMap::new(),
        sections: vec![DocumentSection::Content(ContentSection {
            id: "body".to_string(),
            is_optional: false,
            elements: vec![DocumentElement::Custom(CustomElement {
                id: "custom-1".to_string(),
                element_type: "callout".to_string(),
                fields,
            })],
        })],
    }
}

#[test]
fn custom_elements_emit_once() {
    let template = custom_element_template(ParamSpec {
        key: "body".to_string(),
        param_type: ParamType::Content,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    let ast = ast_with_custom_field("body", json!("Only once"));

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let source = &generated.fragments["custom-1"].source;

    assert_eq!(source.matches("#callout(").count(), 1);
}

#[test]
fn custom_length_fields_do_not_emit_raw_typst() {
    let template = custom_element_template(ParamSpec {
        key: "gap".to_string(),
        param_type: ParamType::Length,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    let ast = ast_with_custom_field("gap", json!("12pt)\n#panic(\"owned\")"));

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let source = &generated.fragments["custom-1"].source;

    assert!(!source.contains("panic"));
    assert!(source.contains("gap: none"));
}

fn template_with_figure_wrapper(wrapper: &str) -> TemplateSpec {
    let mut template = custom_element_template(ParamSpec {
        key: "body".to_string(),
        param_type: ParamType::Content,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    template.element_overrides = Some(ElementOverrides {
        figure: Some(ElementOverrideSpec {
            function: None,
            wrapper: Some(wrapper.to_string()),
            extra_fields: vec![],
        }),
        table: Some(ElementOverrideSpec {
            function: None,
            wrapper: Some(wrapper.to_string()),
            extra_fields: vec![],
        }),
    });
    template
}

fn apa_wrapper_extra_fields() -> Vec<ExtraFieldSpec> {
    vec![
        ExtraFieldSpec {
            key: "caption".to_string(),
            param_type: "content".to_string(),
            label: "Caption".to_string(),
        },
        ExtraFieldSpec {
            key: "note".to_string(),
            param_type: "content".to_string(),
            label: "Note".to_string(),
        },
    ]
}

fn template_with_apa_wrapper_fields() -> TemplateSpec {
    let mut template = template_with_figure_wrapper("apa-figure");
    let fields = apa_wrapper_extra_fields();
    let overrides = template.element_overrides.as_mut().unwrap();
    overrides.figure.as_mut().unwrap().extra_fields = fields.clone();
    overrides.table.as_mut().unwrap().extra_fields = fields;
    template
}

fn ast_with_table_and_figure() -> DocumentAST {
    DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "test-template".to_string(),
            template_variant_id: None,
            title: "Figures".to_string(),
            running_head: None,
            keywords: vec![],
            project_settings: ProjectSettings::default(),
            local_overrides: GlobalSettings::default(),
        },
        dependencies: DependencyManifest { packages: vec![] },
        references: vec![],
        assets: vec![],
        inputs: HashMap::new(),
        sections: vec![DocumentSection::Content(ContentSection {
            id: "body".to_string(),
            is_optional: false,
            elements: vec![
                DocumentElement::Table(Table {
                    id: "table-1".to_string(),
                    rows: 1,
                    cols: 1,
                    cells: vec![vec![TableCell {
                        content: "Cell".to_string(),
                        row_span: None,
                        col_span: None,
                    }]],
                    column_sizes: vec!["1fr".to_string()],
                    extra_fields: HashMap::new(),
                }),
                DocumentElement::Figure(Box::new(Figure {
                    id: "figure-1".to_string(),
                    asset_id: None,
                    content: DocumentElement::Paragraph(Paragraph {
                        id: "figure-1-body".to_string(),
                        content: vec![RichText {
                            text: "Body".to_string(),
                            bold: None,
                            italic: None,
                            kind: None,
                            reference_id: None,
                            equation_source: None,
                        }],
                    }),
                    caption: "Caption".to_string(),
                    placement: "bottom".to_string(),
                    extra_fields: HashMap::new(),
                })),
            ],
        })],
    }
}

#[test]
fn tables_and_figures_default_to_standard_figure_wrapper() {
    let template = custom_element_template(ParamSpec {
        key: "body".to_string(),
        param_type: ParamType::Content,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    let ast = ast_with_table_and_figure();
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    let table_source = &generated.fragments["table-1"].source;
    assert!(table_source.contains("#figure("));
    assert!(table_source.contains("table("));
    assert!(!table_source.starts_with("#table("));

    let figure_source = &generated.fragments["figure-1"].source;
    assert!(figure_source.contains("#figure("));
    assert!(figure_source.contains("placement: bottom"));
}

#[test]
fn tables_and_figures_use_template_wrapper() {
    let template = template_with_figure_wrapper("apa-figure");
    let ast = ast_with_table_and_figure();
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    let table_source = &generated.fragments["table-1"].source;
    assert!(table_source.contains("#import \"@preview/test:1.0.0\": apa-figure"));
    assert!(table_source.contains("#apa-figure("));
    assert!(!table_source.contains("#figure("));

    let figure_source = &generated.fragments["figure-1"].source;
    assert!(figure_source.contains("#import \"@preview/test:1.0.0\": apa-figure"));
    assert!(figure_source.contains("#apa-figure("));
    assert!(!figure_source.contains("#figure("));
    assert!(figure_source.contains("placement: bottom"));
}

#[test]
fn apa_figure_with_image_emits_direct_image_not_nested_typst_figure() {
    let template = template_with_figure_wrapper("apa-figure");
    let mut ast = ast_with_table_and_figure();
    ast.assets.push(AssetEntry {
        id: "asset-1".to_string(),
        path: "assets/photo.webp".to_string(),
        kind: "image".to_string(),
        caption: None,
    });
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        if let DocumentElement::Figure(figure) = &mut section.elements[1] {
            figure.asset_id = Some("asset-1".to_string());
        }
    }

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let figure_source = &generated.fragments["figure-1"].source;

    assert!(figure_source.contains("#apa-figure("));
    assert!(
        figure_source.contains("image(\"../assets/photo.webp\")"),
        "image path must be relative to elements/ dir; got:\n{figure_source}"
    );
    assert!(!figure_source.contains("#image("));
    assert!(!figure_source.contains("#figure("));
}

#[test]
fn figure_image_path_is_relative_to_element_file_location() {
    let template = template_with_figure_wrapper("apa-figure");
    let mut ast = ast_with_table_and_figure();
    ast.assets.push(AssetEntry {
        id: "asset-1".to_string(),
        path: "assets/photo.webp".to_string(),
        kind: "image".to_string(),
        caption: None,
    });
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        if let DocumentElement::Figure(figure) = &mut section.elements[1] {
            figure.asset_id = Some("asset-1".to_string());
        }
    }

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    let figure_fragment = &generated.fragments["figure-1"];
    let element_file_path = &generated
        .layout
        .section_paths
        .iter()
        .find(|p| p.contains("figure-1"))
        .expect("figure element file must be in layout.section_paths");

    assert!(
        element_file_path.starts_with("elements/"),
        "element file should be in elements/ directory: {element_file_path}"
    );
    assert!(
        figure_fragment
            .source
            .contains("image(\"../assets/photo.webp\")"),
        "image() path must climb out of elements/ to reach assets/; got:\n{}",
        figure_fragment.source
    );

    let main_source = &generated.main_source;
    assert!(
        main_source.contains(&format!("#include \"{}\"", element_file_path)),
        "main.typ must include the element file; got:\n{main_source}"
    );
}

#[test]
fn standard_figure_wrapper_also_uses_relative_image_path() {
    let template = custom_element_template(ParamSpec {
        key: "body".to_string(),
        param_type: ParamType::Content,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    let mut ast = ast_with_table_and_figure();
    ast.assets.push(AssetEntry {
        id: "asset-1".to_string(),
        path: "assets/diagram.png".to_string(),
        kind: "image".to_string(),
        caption: None,
    });
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        if let DocumentElement::Figure(figure) = &mut section.elements[1] {
            figure.asset_id = Some("asset-1".to_string());
        }
    }

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let figure_source = &generated.fragments["figure-1"].source;

    assert!(
        figure_source.contains("image(\"../assets/diagram.png\")"),
        "standard figure wrapper must also use relative path; got:\n{figure_source}"
    );
}

#[test]
fn wrapper_extra_fields_emit_in_typst_output() {
    let mut ast = ast_with_table_and_figure();
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        for element in &mut section.elements {
            match element {
                DocumentElement::Figure(figure) => {
                    figure
                        .extra_fields
                        .insert("note".to_string(), json!("See appendix for raw data."));
                }
                DocumentElement::Table(table) => {
                    table
                        .extra_fields
                        .insert("caption".to_string(), json!("Participant counts by group."));
                }
                _ => {}
            }
        }
    }

    let template = template_with_apa_wrapper_fields();
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    let figure_source = &generated.fragments["figure-1"].source;
    assert!(figure_source.contains("note: ["));
    assert!(figure_source.contains("See appendix for raw data."));

    let table_source = &generated.fragments["table-1"].source;
    assert!(table_source.contains("caption: ["));
    assert!(table_source.contains("Participant counts by group."));
}

#[test]
fn apa_figure_note_without_caption_avoids_double_comma() {
    let mut ast = ast_with_table_and_figure();
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        for element in &mut section.elements {
            if let DocumentElement::Figure(figure) = element {
                figure.asset_id = Some("asset-1".to_string());
                figure.caption = String::new();
                figure
                    .extra_fields
                    .insert("note".to_string(), json!("Figure note text."));
            }
        }
    }
    ast.assets.push(AssetEntry {
        id: "asset-1".to_string(),
        path: "assets/sample.png".to_string(),
        kind: "image".to_string(),
        caption: None,
    });

    let template = template_with_apa_wrapper_fields();
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    let figure_source = &generated.fragments["figure-1"].source;
    assert!(
        !figure_source.contains(",\n,"),
        "double comma in generated figure:\n{figure_source}"
    );
    assert!(figure_source.contains("note: ["));
    assert!(figure_source.contains("Figure note text."));
}

#[test]
fn versatile_apa_main_typ_includes_front_matter_outlines_and_appendix_rule() {
    use crate::template_spec::load_bundled_template;

    let mut ast = ast_with_table_and_figure();
    ast.sections = vec![DocumentSection::Content(ContentSection {
        id: "body".to_string(),
        is_optional: false,
        elements: vec![],
    })];

    let template = load_bundled_template("versatile-apa").expect("versatile-apa template");
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    assert!(
        generated.main_source.contains("#outline()"),
        "main.typ should include document outline; got:\n{}",
        generated.main_source
    );
    assert!(
        generated.main_source.contains("#appendix-outline"),
        "main.typ should include appendix outline; got:\n{}",
        generated.main_source
    );
    assert!(
        generated.main_source.contains("#show: appendix"),
        "main.typ should enable appendix show rule; got:\n{}",
        generated.main_source
    );
}
