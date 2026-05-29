#![allow(irrefutable_let_patterns)]
use crate::ast::{
    ContentSection, DependencyManifest, DocumentAST, DocumentElement, DocumentSection, Package,
    EquationSyntax, GlobalSettings, Heading, Paragraph, ProjectMetadata, ProjectSettings, RichText,
};

pub fn rich_text(text: &str) -> RichText {
    RichText {
        text: text.to_string(),
        bold: None,
        italic: None,
        underline: None,
        kind: None,
        reference_id: None,
        equation_source: None,
        equation_syntax: EquationSyntax::Typst,
    }
}

pub fn basic_document_ast(title: &str, abstract_text: &str) -> DocumentAST {
    let mut inputs = std::collections::HashMap::new();
    inputs.insert("title".to_string(), serde_json::json!(title));
    inputs.insert("running_head".to_string(), serde_json::json!(""));
    inputs.insert(
        "abstract_text".to_string(),
        serde_json::json!(abstract_text),
    );
    inputs.insert("authors".to_string(), serde_json::json!([]));
    inputs.insert("affiliations".to_string(), serde_json::json!([]));
    inputs.insert("course".to_string(), serde_json::json!(""));
    inputs.insert("due_date".to_string(), serde_json::json!(""));
    inputs.insert("instructor".to_string(), serde_json::json!(""));
    inputs.insert("author_note".to_string(), serde_json::json!(""));
    inputs.insert("keywords".to_string(), serde_json::json!([]));

    DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "apa7".to_string(),
            template_variant_id: Some("student".to_string()),
            title: title.to_string(),
            project_settings: ProjectSettings::default(),
            local_overrides: GlobalSettings::default(),
            running_head: None,
            keywords: vec![],
        },
        dependencies: DependencyManifest { packages: vec![] },
        references: vec![],
        assets: vec![],
        sections: vec![DocumentSection::Content(ContentSection {
            id: "content-section".to_string(),
            is_optional: false,
            elements: vec![DocumentElement::Heading(Heading {
                id: "heading-1".to_string(),
                level: 2,
                content: vec![rich_text("Introducción")],
            })],
        })],
        inputs,
    }
}

/// Matches `createDefaultDocumentAST()` in `src/state/ast/defaults.ts` (new apa7 project).
pub fn default_apa7_project_ast() -> DocumentAST {
    let mut inputs = std::collections::HashMap::new();
    inputs.insert("title".to_string(), serde_json::json!("Untitled Document"));
    inputs.insert("running_head".to_string(), serde_json::json!(""));
    inputs.insert("abstract_text".to_string(), serde_json::json!(""));
    inputs.insert(
        "authors".to_string(),
        serde_json::json!([{ "name": "", "affiliations": [] }]),
    );
    inputs.insert("affiliations".to_string(), serde_json::json!([]));
    inputs.insert("course".to_string(), serde_json::json!(""));
    inputs.insert("due_date".to_string(), serde_json::json!(""));
    inputs.insert("instructor".to_string(), serde_json::json!(""));
    inputs.insert("author_note".to_string(), serde_json::json!(""));
    inputs.insert("keywords".to_string(), serde_json::json!([]));

    DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "apa7".to_string(),
            template_variant_id: Some("student".to_string()),
            title: "Untitled Document".to_string(),
            project_settings: ProjectSettings::default(),
            local_overrides: GlobalSettings::default(),
            running_head: None,
            keywords: vec![],
        },
        dependencies: DependencyManifest {
            packages: vec![Package {
                name: "@preview/versatile-apa".to_string(),
                version: "7.2.0".to_string(),
            }],
        },
        references: vec![],
        assets: vec![],
        sections: vec![DocumentSection::Content(ContentSection {
            id: "content-section".to_string(),
            is_optional: false,
            elements: vec![],
        })],
        inputs,
    }
}

pub fn preview_sync_document_ast() -> DocumentAST {
    let mut ast = basic_document_ast("Título con ñ", "");
    if let DocumentSection::Content(content) = &mut ast.sections[0] {
        content.elements = vec![
            DocumentElement::Heading(Heading {
                id: "heading-ñ".to_string(),
                level: 2,
                content: vec![rich_text("Introducción")],
            }),
            DocumentElement::Paragraph(Paragraph {
                id: "paragraph-emoji".to_string(),
                content: vec![rich_text("Niñez, acción y símbolos 🌍.")],
            }),
        ];
    }
    ast
}
