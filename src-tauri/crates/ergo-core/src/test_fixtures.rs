#![allow(irrefutable_let_patterns)]
use crate::ast::{
    ContentSection, DependencyManifest, DocumentAST, DocumentElement, DocumentSection, Package,
    EquationSyntax, GlobalSettings, Heading, Paragraph, ProjectMetadata, ProjectSettings, RichText,
    TableCell,
};

pub fn table_cell_from_text(text: &str) -> TableCell {
    TableCell {
        elements: vec![DocumentElement::Paragraph(Paragraph {
            id: format!("cell-p-{}", uuid::Uuid::new_v4()),
            content: vec![rich_text(text)],
        })],
        row_span: None,
        col_span: None,
    }
}

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

/// Approximates a fresh `umb-apa` project: full front-matter inputs + one body paragraph.
pub fn default_umb_apa_project_ast() -> DocumentAST {
    let mut inputs = std::collections::HashMap::new();
    inputs.insert("title".to_string(), serde_json::json!("UMB APA Title"));
    inputs.insert("running_head".to_string(), serde_json::json!("Running Head"));
    inputs.insert(
        "authors".to_string(),
        serde_json::json!([{ "name": "Author 1", "affiliations": ["a"], "degrees": ["a"] }]),
    );
    inputs.insert("affiliations".to_string(), serde_json::json!(["Affiliation Name 1"]));
    inputs.insert("degrees".to_string(), serde_json::json!(["Ingeniero de Sistemas"]));
    inputs.insert(
        "director".to_string(),
        serde_json::json!({ "name": "Director Name", "title": "Director Title" }),
    );
    inputs.insert("city".to_string(), serde_json::json!("Bogotá"));
    inputs.insert("country".to_string(), serde_json::json!("Colombia"));
    inputs.insert("year".to_string(), serde_json::json!("2026"));
    inputs.insert(
        "authorities".to_string(),
        serde_json::json!([{ "name": "Authority 1", "role": "Role 1" }]),
    );
    inputs.insert("acknowledgements".to_string(), serde_json::json!("Agradezco a todos."));
    inputs.insert("abstract_es".to_string(), serde_json::json!("Resumen en espanol."));
    inputs.insert("keywords_es".to_string(), serde_json::json!(["clave1", "clave2"]));
    inputs.insert("abstract_en".to_string(), serde_json::json!("Abstract in English."));
    inputs.insert("keywords_en".to_string(), serde_json::json!(["key1", "key2"]));

    DocumentAST {
        version: "1.0".to_string(),
        metadata: ProjectMetadata {
            template_id: "umb-apa".to_string(),
            template_variant_id: None,
            title: "UMB APA Title".to_string(),
            project_settings: ProjectSettings::default(),
            local_overrides: GlobalSettings::default(),
            running_head: Some("Running Head".to_string()),
            keywords: vec![],
        },
        dependencies: DependencyManifest { packages: vec![] },
        references: vec![],
        assets: vec![],
        sections: vec![DocumentSection::Content(ContentSection {
            id: "content-section".to_string(),
            is_optional: false,
            elements: vec![DocumentElement::Paragraph(Paragraph {
                id: "p-1".to_string(),
                content: vec![rich_text("Body paragraph text.")],
            })],
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

pub fn populate_versatile_apa(vfs: &crate::vfs::VirtualFileSystem) {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let base_dir = manifest_dir.join("../../../typst_templates/versatile-apa");

    fn walk(dir: &std::path::Path, base: &std::path::Path, vfs: &crate::vfs::VirtualFileSystem) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, base, vfs);
                } else if path.is_file() {
                    if let Ok(rel) = path.strip_prefix(base) {
                        let rel_str = rel.to_string_lossy().replace('\\', "/");
                        if rel_str.starts_with("template/") {
                            continue;
                        }
                        if let Ok(bytes) = std::fs::read(&path) {
                            let dest_path = format!("versatile-apa/{}", rel_str);
                            let is_text = dest_path.ends_with(".typ")
                                || dest_path.ends_with(".json")
                                || dest_path.ends_with(".bib");
                            if is_text {
                                if let Ok(text) = std::str::from_utf8(&bytes) {
                                    vfs.write_source(&dest_path, text.to_string());
                                    continue;
                                }
                            }
                            vfs.write_file(&dest_path, bytes);
                        }
                    }
                }
            }
        }
    }
    walk(&base_dir, &base_dir, vfs);
}

pub fn populate_umb_apa(vfs: &crate::vfs::VirtualFileSystem) {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let base_dir = manifest_dir.join("../../../typst_templates/umb-apa");

    fn walk(dir: &std::path::Path, base: &std::path::Path, vfs: &crate::vfs::VirtualFileSystem) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, base, vfs);
                } else if path.is_file() {
                    if let Ok(rel) = path.strip_prefix(base) {
                        let rel_str = rel.to_string_lossy().replace('\\', "/");
                        if rel_str.starts_with("template/") {
                            continue;
                        }
                        if let Ok(bytes) = std::fs::read(&path) {
                            let dest_path = format!("umb-apa/{}", rel_str);
                            let is_text = dest_path.ends_with(".typ")
                                || dest_path.ends_with(".json")
                                || dest_path.ends_with(".bib");
                            if is_text {
                                if let Ok(text) = std::str::from_utf8(&bytes) {
                                    vfs.write_source(&dest_path, text.to_string());
                                    continue;
                                }
                            }
                            vfs.write_file(&dest_path, bytes);
                        }
                    }
                }
            }
        }
    }
    walk(&base_dir, &base_dir, vfs);
}

