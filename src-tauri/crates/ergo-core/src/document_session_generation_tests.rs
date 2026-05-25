use super::*;
use crate::ast::{
    ContentSection, CustomElement, DependencyManifest, DocumentElement, DocumentSection,
    GlobalSettings, ProjectMetadata, ProjectSettings, RichText,
};
use crate::document_source_builder::SourceBuilder;
use crate::template_spec::{
    CustomElementSpec, InputGroupSpec, PackageSpec, ParamSpec, SectionSpec, ShowRuleSpec,
    TemplateIdentity,
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
