use super::*;
use crate::ast::{
    AssetEntry, ContentSection, CustomElement, DependencyManifest, DocumentElement,
    DocumentSection, Enumeration, Equation, EquationSyntax, GlobalSettings, List, ProjectMetadata,
    ProjectSettings, Quote, ReferenceEntry, RichText,
};
use crate::ast::{Diagram, Figure, Paragraph, Table, TableCell};
use crate::document_source_builder::SourceBuilder;
use crate::template_spec::{
    CustomElementSpec, ElementOverrideSpec, ElementOverrides, ExtraFieldSpec, InputGroupSpec,
    PackageSpec, ParamSpec, ParamType, SectionSpec, ShowRuleSpec, TemplateSpec,
    TemplateMetadata, TypstConfig, EditorConfig,
};
use crate::test_fixtures::rich_text;
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
        underline: None,
        kind: Some("reference".to_string()),
        reference_id: Some("bib-ref-1".to_string()),
        equation_source: None,
        equation_syntax: EquationSyntax::Typst,
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
        metadata: TemplateMetadata {
            id: "test-template".to_string(),
            name: "Test Template".to_string(),
            version: "1.0.0".to_string(),
            description: None,
        },
        typst: TypstConfig {
            package: PackageSpec {
                name: "@preview/test".to_string(),
                version: "1.0.0".to_string(),
                imports: vec![],
                dependencies: vec![],
            },
            show_rule: Some(ShowRuleSpec {
                function: "apply".to_string(),
                params: vec![],
                variants: None,
            }),
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
            default_template_overrides: vec![],
        },
        editor: EditorConfig {
            inputs: vec![],
            groups: Vec::<InputGroupSpec>::new(),
            variants: vec![],
            custom_elements: vec![CustomElementSpec {
                kind: "callout".to_string(),
                label: "Callout".to_string(),
                description: None,
                function: "callout".to_string(),
                fields: vec![field],
            }],
            defaults: None,
        },
        messages: std::collections::HashMap::new(),
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
fn native_quote_list_diagram_and_latex_equations_emit_typst() {
    let template = custom_element_template(ParamSpec {
        key: "body".to_string(),
        param_type: ParamType::Content,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    let mut ast = ast_with_custom_field("body", json!("Paper body"));
    ast.assets = vec![AssetEntry {
        id: "diagram-1".to_string(),
        path: "assets/diagrams/diagram-1.svg".to_string(),
        kind: "image".to_string(),
        caption: None,
    }];
    ast.sections = vec![DocumentSection::Content(ContentSection {
        id: "body".to_string(),
        is_optional: false,
        elements: vec![
            DocumentElement::Quote(Quote {
                id: "quote-1".to_string(),
                content: vec![rich_text("quoted text")],
            }),
            DocumentElement::List(List {
                id: "list-1".to_string(),
                items: vec![vec![rich_text("first item")]],
            }),
            DocumentElement::Enumeration(Enumeration {
                id: "enum-1".to_string(),
                items: vec![vec![rich_text("numbered item")]],
            }),
            DocumentElement::Equation(Equation {
                id: "equation-1".to_string(),
                latex_source: "\\frac{1}{2}".to_string(),
                is_block: true,
                syntax: EquationSyntax::Latex,
            }),
            DocumentElement::Diagram(Diagram {
                id: "diagram-1".to_string(),
                mermaid_source: "flowchart TD\nA-->B".to_string(),
                asset_id: Some("diagram-1".to_string()),
                caption: "Flow".to_string(),
                placement: "here".to_string(),
                extra_fields: HashMap::new(),
            }),
        ],
    })];

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    assert!(generated.fragments["quote-1"]
        .source
        .contains("#quote(block: true)"));
    assert!(generated.fragments["list-1"].source.contains("#list("));
    assert!(generated.fragments["enum-1"].source.contains("#enum("));
    let equation_source = &generated.fragments["equation-1"].source;
    assert!(equation_source.contains("#import \"@preview/mitex:0.2.7\": mi, mitex"));
    assert!(equation_source.contains("#mitex("));
    let diagram_source = &generated.fragments["diagram-1"].source;
    assert!(diagram_source.contains("#figure("));
    assert!(diagram_source.contains("image(\"../assets/diagrams/diagram-1.svg\")"));
}

#[test]
fn none_template_injects_outlines_and_wraps_floats_in_figure() {
    use crate::ast::Diagram;
    use crate::template_spec::load_bundled_template;

    let template = load_bundled_template("none").unwrap();
    let mut ast = ast_with_table_and_figure();
    ast.metadata.template_id = "none".to_string();
    ast.metadata.project_settings.template_overrides = vec![];
    ast.sections = vec![DocumentSection::Content(ContentSection {
        id: "body".to_string(),
        is_optional: false,
        elements: vec![DocumentElement::Diagram(Diagram {
            id: "diagram-none".to_string(),
            mermaid_source: "flowchart TD\nA-->B".to_string(),
            asset_id: Some("diagram-none".to_string()),
            caption: "Chart".to_string(),
            placement: "bottom".to_string(),
            extra_fields: HashMap::new(),
        })],
    })];
    ast.assets.push(AssetEntry {
        id: "diagram-none".to_string(),
        path: "assets/diagrams/diagram-none.svg".to_string(),
        kind: "image".to_string(),
        caption: None,
    });

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    assert!(
        !generated.main_source.contains("#outline"),
        "none template must not emit outlines by default:\n{}",
        generated.main_source
    );
    let diagram_source = &generated.fragments["diagram-none"].source;
    assert!(
        diagram_source.contains("#figure("),
        "diagram must use standard figure wrapper:\n{diagram_source}"
    );
    assert!(diagram_source.contains("caption: ["));
    assert!(diagram_source.contains("Chart"));
    assert!(
        !diagram_source.contains("[image("),
        "image must be a direct #figure argument, not literal text inside a content block:\n{diagram_source}"
    );
}

#[test]
fn project_paper_size_is_emitted_before_document_body() {
    let template = custom_element_template(ParamSpec {
        key: "body".to_string(),
        param_type: ParamType::Content,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    let mut ast = ast_with_custom_field("body", json!("Paper body"));
    ast.metadata.project_settings.paper_size = Some("a4".to_string());

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let page_set = generated
        .lib_source
        .find("#set page(paper: \"a4\")")
        .expect("project paper size should be emitted into lib.typ");
    let body = generated
        .lib_source
        .find("#body")
        .expect("lib.typ should contain body insertion");

    assert!(
        page_set < body,
        "project page setting must precede body insertion:\n{}",
        generated.lib_source
    );
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
    template.typst.element_overrides = Some(ElementOverrides {
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
    let overrides = template.typst.element_overrides.as_mut().unwrap();
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
                    cells: vec![vec![crate::test_fixtures::table_cell_from_text("Cell")]],
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
                            underline: None,
                            kind: None,
                            reference_id: None,
                            equation_source: None,
                            equation_syntax: EquationSyntax::Typst,
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
fn table_cell_spans_emit_table_cell_delimiters() {
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
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        if let DocumentElement::Table(table) = &mut section.elements[0] {
            table.rows = 1;
            table.cols = 2;
            let mut merged = crate::test_fixtures::table_cell_from_text("Merged");
            merged.col_span = Some(2);
            table.cells = vec![vec![merged]];
            table.column_sizes = vec!["1fr".to_string(), "1fr".to_string()];
        }
    }

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let table_source = &generated.fragments["table-1"].source;
    assert!(
        table_source.contains("table.cell(colspan: 2)["),
        "expected merged cell span in:\n{table_source}"
    );
    assert!(table_source.contains("Merged"));
}

#[test]
fn table_cell_multiline_elements_emit_paragraph_break() {
    let template = template_with_apa_wrapper_fields();
    let mut ast = ast_with_table_and_figure();
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        if let DocumentElement::Table(table) = &mut section.elements[0] {
            table.rows = 1;
            table.cols = 1;
            table.cells = vec![vec![TableCell {
                elements: vec![
                    DocumentElement::Paragraph(Paragraph {
                        id: "cell-p-1".to_string(),
                        content: vec![RichText {
                            text: "Then happens what needs to happen.".to_string(),
                            bold: None,
                            italic: None,
                            underline: None,
                            kind: None,
                            reference_id: None,
                            equation_source: None,
                            equation_syntax: EquationSyntax::Typst,
                        }],
                    }),
                    DocumentElement::Paragraph(Paragraph {
                        id: "cell-p-2".to_string(),
                        content: vec![RichText {
                            text: "Finalmente.".to_string(),
                            bold: None,
                            italic: None,
                            underline: None,
                            kind: None,
                            reference_id: None,
                            equation_source: None,
                            equation_syntax: EquationSyntax::Typst,
                        }],
                    }),
                ],
                col_span: None,
                row_span: None,
            }]];
            table.column_sizes = vec!["1fr".to_string()];
        }
    }

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let table_source = &generated.fragments["table-1"].source;
    assert!(
        table_source.contains("Then happens what needs to happen."),
        "expected first paragraph in:\n{table_source}"
    );
    assert!(
        table_source.contains("Finalmente."),
        "expected second paragraph in:\n{table_source}"
    );
    assert_eq!(
        table_source.matches('[').count(),
        table_source.matches(']').count(),
        "unbalanced brackets in:\n{table_source}"
    );
}

#[test]
fn table_width_wraps_table_in_sized_block() {
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
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        if let DocumentElement::Table(table) = &mut section.elements[0] {
            table.extra_fields.insert(
                "width".to_string(),
                serde_json::Value::String("80%".to_string()),
            );
        }
    }

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let table_source = &generated.fragments["table-1"].source;
    assert!(
        table_source.contains("block(width: 80%)["),
        "expected table wrapped in a sized block:\n{table_source}"
    );
}

#[test]
fn table_width_auto_does_not_wrap() {
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
    if let DocumentSection::Content(section) = &mut ast.sections[0] {
        if let DocumentElement::Table(table) = &mut section.elements[0] {
            table.extra_fields.insert(
                "width".to_string(),
                serde_json::Value::String("auto".to_string()),
            );
        }
    }

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let table_source = &generated.fragments["table-1"].source;
    assert!(
        !table_source.contains("block(width:"),
        "auto width must not wrap the table:\n{table_source}"
    );
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
    assert!(figure_fragment.source.contains("#apa-figure("));
    assert!(
        figure_fragment.source.contains("image(\"../assets/photo.webp\")"),
        "image() path must climb out of elements/ to reach assets/; got:\n{}",
        figure_fragment.source
    );
    assert!(!figure_fragment.source.contains("#image("));
    assert!(!figure_fragment.source.contains("#figure("));

    let main_source = &generated.main_source;
    assert!(
        main_source.contains(&format!("#include \"{}\"", element_file_path)),
        "main.typ must include the element file; got:\n{main_source}"
    );

    let standard_template = custom_element_template(ParamSpec {
        key: "body".to_string(),
        param_type: ParamType::Content,
        source: None,
        label: None,
        default: None,
        required: false,
        variants: None,
    });
    let mut standard_ast = ast_with_table_and_figure();
    standard_ast.assets.push(AssetEntry {
        id: "asset-2".to_string(),
        path: "assets/diagram.png".to_string(),
        kind: "image".to_string(),
        caption: None,
    });
    if let DocumentSection::Content(section) = &mut standard_ast.sections[0] {
        if let DocumentElement::Figure(figure) = &mut section.elements[1] {
            figure.asset_id = Some("asset-2".to_string());
        }
    }
    let standard_generated = generate_project_sources_incremental(
        &standard_ast,
        &standard_template,
        &HashMap::new(),
        &HashMap::new(),
    );
    let standard_figure = &standard_generated.fragments["figure-1"].source;
    assert!(
        standard_figure.contains("image(\"../assets/diagram.png\")"),
        "standard figure wrapper must also use relative path; got:\n{standard_figure}"
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
fn apa7_main_typ_includes_front_matter_outlines_and_appendix_rule() {
    use crate::template_spec::load_bundled_template;

    let mut ast = ast_with_table_and_figure();
    ast.sections = vec![DocumentSection::Content(ContentSection {
        id: "body".to_string(),
        is_optional: false,
        elements: vec![],
    })];

    let template = load_bundled_template("apa7").expect("apa7 template");
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    assert!(
        generated.main_source.contains("title: [Contents]"),
        "main.typ should include document outline; got:\n{}",
        generated.main_source
    );
    assert!(
        generated.main_source.contains("#appendix-outline(title: [Appendices])"),
        "main.typ should include appendix outline; got:\n{}",
        generated.main_source
    );
    assert!(
        generated.main_source.contains("#show: appendix"),
        "main.typ should enable appendix show rule; got:\n{}",
        generated.main_source
    );
}

#[test]
fn outline_generation_respects_include_flags() {
    use crate::ast::TemplateOverride;
    use crate::template_spec::load_bundled_template;

    let mut ast = ast_with_table_and_figure();
    ast.sections = vec![DocumentSection::Content(ContentSection {
        id: "body".to_string(),
        is_optional: false,
        elements: vec![],
    })];
    ast.metadata.project_settings.template_overrides = vec![TemplateOverride {
        key: "outline.include_figures".to_string(),
        value: "false".to_string(),
    }];

    let template = load_bundled_template("apa7").expect("apa7 template");
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    assert!(generated.main_source.contains("title: [Contents]"));
    assert!(!generated.main_source.contains("kind: image"));
}

#[test]
fn apa7_outline_titles_use_project_template_overrides() {
    use crate::ast::TemplateOverride;
    use crate::template_spec::load_bundled_template;

    let mut ast = ast_with_table_and_figure();
    ast.sections = vec![DocumentSection::Content(ContentSection {
        id: "body".to_string(),
        is_optional: false,
        elements: vec![],
    })];
    ast.metadata.project_settings.template_overrides = vec![TemplateOverride {
        key: "outline.tables_title".to_string(),
        value: "Tablas del documento".to_string(),
    }];

    let template = load_bundled_template("apa7").expect("apa7 template");
    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    assert!(
        generated
            .main_source
            .contains("#outline(target: figure.where(kind: table), title: [Tablas del documento])"),
        "main.typ should include the configured tables outline title; got:\n{}",
        generated.main_source
    );
}

#[test]
fn umb_apa_source_generation_matches_spec() {
    use crate::template_spec::load_bundled_template;
    
    let template = load_bundled_template("umb-apa").expect("umb-apa template");
    
    let mut inputs = HashMap::new();
    inputs.insert("title".to_string(), json!("UMB APA Title"));
    inputs.insert("running_head".to_string(), json!("Running Head Text"));
    inputs.insert("authors".to_string(), json!([
        {
            "name": "Author 1",
            "affiliations": ["a"],
            "degrees": ["a"]
        }
    ]));
    inputs.insert("affiliations".to_string(), json!(["Affiliation Name 1"]));
    inputs.insert("degrees".to_string(), json!(["Ingeniero de Sistemas"]));
    inputs.insert("director".to_string(), json!({
        "name": "Director Name",
        "title": "Director Title"
    }));
    inputs.insert("city".to_string(), json!("Bogotá"));
    inputs.insert("country".to_string(), json!("Colombia"));
    inputs.insert("year".to_string(), json!("2026"));
    inputs.insert("authorities".to_string(), json!([
        {
            "name": "Authority 1",
            "role": "Role 1"
        },
        {
            "name": "Authority 2",
            "role": "Role 2"
        }
    ]));
    inputs.insert("acknowledgements".to_string(), json!("Agradezco a todos."));
    inputs.insert("abstract_es".to_string(), json!("Resumen en espanol."));
    inputs.insert("keywords_es".to_string(), json!(["clave1", "clave2"]));
    inputs.insert("abstract_en".to_string(), json!("Abstract in English."));
    inputs.insert("keywords_en".to_string(), json!(["key1", "key2"]));

    let ast = DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "umb-apa".to_string(),
            template_variant_id: None,
            title: "UMB APA Title".to_string(),
            running_head: Some("Running Head Text".to_string()),
            keywords: vec![],
            project_settings: ProjectSettings::default(),
            local_overrides: GlobalSettings::default(),
        },
        dependencies: DependencyManifest { packages: vec![] },
        references: vec![ReferenceEntry {
            id: "ref-1".to_string(),
            citation_key: "ref-1".to_string(),
            biblatex: "@book{ref-1}".to_string(),
        }],
        assets: vec![],
        inputs,
        sections: vec![
            DocumentSection::Content(ContentSection {
                id: "body".to_string(),
                is_optional: false,
                elements: vec![
                    DocumentElement::Paragraph(Paragraph {
                        id: "p-1".to_string(),
                        content: vec![RichText {
                            text: "Paragraph text".to_string(),
                            bold: None,
                            italic: None,
                            underline: None,
                            kind: None,
                            reference_id: None,
                            equation_source: None,
                            equation_syntax: EquationSyntax::Typst,
                        }],
                    })
                ],
            })
        ],
    };

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());

    let main = &generated.main_source;

    // Generated UMB main.typ contains one front-matter call.
    assert!(main.contains("#front-matter("), "main.typ should call front-matter function:\n{main}");
    
    // Generated UMB main.typ does not call title-page or abstract-page.
    assert!(!main.contains("title-page"), "main.typ should not call title-page:\n{main}");
    assert!(!main.contains("abstract-page"), "main.typ should not call abstract-page:\n{main}");

    assert!(main.contains("degrees: ("), "should contain degrees map:\n{main}");
    assert!(
        main.contains("\"a\": [Ingeniero de Sistemas]"),
        "should emit letter-keyed degree map:\n{main}"
    );
    assert!(
        main.contains("country: [Colombia]"),
        "should contain country:\n{main}"
    );
    assert!(
        main.contains("affiliations: (\"a\",)"),
        "should emit letter-keyed author affiliation refs:\n{main}"
    );

    // director.name and director.title appear in the generated front-matter arguments.
    assert!(main.contains("director: ("), "should contain director dictionary:\n{main}");
    assert!(main.contains("name: [Director Name]"), "should contain director name:\n{main}");
    assert!(main.contains("title: [Director Title]"), "should contain director title:\n{main}");

    // Every authority emits a name and role.
    assert!(main.contains("authorities: ("), "should contain authorities array:\n{main}");
    assert!(main.contains("name: [Authority 1]"), "should contain authority 1 name:\n{main}");
    assert!(main.contains("role: [Role 1]"), "should contain authority 1 role:\n{main}");
    assert!(main.contains("name: [Authority 2]"), "should contain authority 2 name:\n{main}");
    assert!(main.contains("role: [Role 2]"), "should contain authority 2 role:\n{main}");

    // abstract_es maps to abstract-es, and abstract_en maps to abstract-en.
    assert!(main.contains("abstract-es: [Resumen en espanol.]"), "should map abstract-es:\n{main}");
    assert!(main.contains("abstract-en: [Abstract in English.]"), "should map abstract-en:\n{main}");

    // keywords_es maps to keywords-es, and keywords_en maps to keywords-en.
    assert!(main.contains("keywords-es: (\"clave1\", \"clave2\")"), "should map keywords-es:\n{main}");
    assert!(main.contains("keywords-en: (\"key1\", \"key2\")"), "should map keywords-en:\n{main}");

    // running_head still flows through the document show rule in lib.typ
    assert!(generated.lib_source.contains("running-head: [Running Head Text]"), "lib.typ should pass running-head to show rule:\n{}", generated.lib_source);

    // Body element includes still appear after front matter.
    let front_matter_pos = main.find("#front-matter").unwrap();
    let body_pos = main.find("#include \"elements/p-1.typ\"").unwrap();
    assert!(front_matter_pos < body_pos, "front matter should precede body includes:\n{main}");

    // Bibliography and appendix generation still appear in the expected order.
    let bib_pos = main.find("#bibliography").unwrap();
    assert!(body_pos < bib_pos, "body includes should precede bibliography:\n{main}");
}

#[test]
fn content_blocks_input_generates_paragraphs_separated_by_parbreak() {
    use crate::template_spec::load_bundled_template;

    let template = load_bundled_template("umb-apa").expect("umb-apa template");
    let mut ast = crate::test_fixtures::default_umb_apa_project_ast();
    // `content_blocks` value: two paragraphs, each a `RichText[]`.
    ast.inputs.insert(
        "abstract_es".to_string(),
        json!([
            [{ "text": "First paragraph.", "bold": null, "italic": null }],
            [{ "text": "Second paragraph.", "bold": null, "italic": null }],
        ]),
    );

    let generated =
        generate_project_sources_incremental(&ast, &template, &HashMap::new(), &HashMap::new());
    let main = &generated.main_source;

    assert!(main.contains("First paragraph."), "first paragraph missing:\n{main}");
    assert!(main.contains("Second paragraph."), "second paragraph missing:\n{main}");
    assert!(
        main.contains("#parbreak()"),
        "multiple paragraphs should be separated by #parbreak():\n{main}"
    );

    // A legacy plain-string value still generates a single paragraph (no parbreak).
    let mut legacy = crate::test_fixtures::default_umb_apa_project_ast();
    legacy
        .inputs
        .insert("abstract_es".to_string(), json!("Just one paragraph."));
    let legacy_generated =
        generate_project_sources_incremental(&legacy, &template, &HashMap::new(), &HashMap::new());
    assert!(
        legacy_generated.main_source.contains("abstract-es: [Just one paragraph.]"),
        "legacy string abstract should still generate one paragraph:\n{}",
        legacy_generated.main_source
    );
}
