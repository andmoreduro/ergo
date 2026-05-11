use crate::ast::{
    ContentSection, CoverPageSection, DependencyManifest, DocumentAST, DocumentElement,
    DocumentSection, GlobalSettings, Heading, Paragraph, ProjectMetadata, ProjectSettings,
    RichText,
};

pub fn rich_text(text: &str) -> RichText {
    RichText {
        text: text.to_string(),
        bold: None,
        italic: None,
        kind: None,
        reference_id: None,
        equation_source: None,
    }
}

pub fn basic_document_ast(title: &str, abstract_text: &str) -> DocumentAST {
    DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "apa7".to_string(),
            title: title.to_string(),
            project_settings: ProjectSettings::default(),
            local_overrides: GlobalSettings::default(),
        },
        dependencies: DependencyManifest { packages: vec![] },
        references: vec![],
        assets: vec![],
        sections: vec![
            DocumentSection::CoverPage(CoverPageSection {
                id: "cover-section".to_string(),
                is_optional: true,
                authors: vec![],
                affiliations: vec![],
                abstract_text: abstract_text.to_string(),
            }),
            DocumentSection::Content(ContentSection {
                id: "content-section".to_string(),
                is_optional: false,
                elements: vec![DocumentElement::Heading(Heading {
                    id: "heading-1".to_string(),
                    level: 2,
                    content: vec![rich_text("Introducción")],
                })],
            }),
        ],
    }
}

pub fn preview_sync_document_ast() -> DocumentAST {
    let mut ast = basic_document_ast("Título con ñ", "");
    if let DocumentSection::Content(content) = &mut ast.sections[1] {
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
