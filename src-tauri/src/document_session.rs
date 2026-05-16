use parking_lot::Mutex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::ast::DocumentAST;
use crate::core_errors::DocumentSessionError;
use crate::document_session_events::apply_document_event;
use crate::document_session_generation::{default_layout, generate_project_sources};
pub use crate::document_session_types::{
    AuthorField, DocumentEvent, DocumentSessionStatus, FieldSourceMapEntry, FieldTextSegment,
    GeneratedFragment, ProjectSourceLayout, SectionSource, SourceMapEntry,
};
use crate::vfs::VirtualFileSystem;

pub(crate) const MAIN_PATH: &str = "main.typ";
pub(crate) const REFERENCES_PATH: &str = "references.bib";
pub(crate) const DOCUMENT_STATE_PATH: &str = ".ergproj/document_state.json";
pub(crate) const DEPENDENCY_MANIFEST_PATH: &str = ".ergproj/dependency_manifest.json";
pub(crate) const PROJECT_SETTINGS_PATH: &str = ".ergproj/project_settings.json";
pub(crate) const TEMPLATE_PATH: &str = ".ergproj/template.json";
pub(crate) const SOURCE_MAP_PATH: &str = ".ergproj/source_map.json";
pub(crate) const FIELD_SOURCE_MAP_PATH: &str = ".ergproj/field_source_map.json";

#[derive(Default)]
struct DocumentSessionInner {
    ast: Option<DocumentAST>,
    fragments: HashMap<String, GeneratedFragment>,
    sections: HashMap<String, SectionSource>,
    source_map: Vec<SourceMapEntry>,
    field_source_map: Vec<FieldSourceMapEntry>,
    last_status: Option<DocumentSessionStatus>,
}

pub struct DocumentSession {
    vfs: Arc<VirtualFileSystem>,
    inner: Mutex<DocumentSessionInner>,
}

impl DocumentSession {
    pub fn new(vfs: Arc<VirtualFileSystem>) -> Self {
        Self {
            vfs,
            inner: Mutex::new(DocumentSessionInner::default()),
        }
    }

    pub fn sync_snapshot(&self, ast: DocumentAST) -> Result<DocumentSessionStatus, String> {
        let mut inner = self.inner.lock();
        self.sync_ast_locked(&mut inner, ast)
    }

    pub fn apply_event(&self, event: DocumentEvent) -> Result<DocumentSessionStatus, String> {
        let mut inner = self.inner.lock();
        let mut ast = inner
            .ast
            .clone()
            .ok_or_else(|| "Document session has not been initialized".to_string())?;
        apply_document_event(&mut ast, event)?;
        self.sync_ast_locked(&mut inner, ast)
    }

    fn sync_ast_locked(
        &self,
        inner: &mut DocumentSessionInner,
        ast: DocumentAST,
    ) -> Result<DocumentSessionStatus, String> {
        let generated = generate_project_sources(&ast);

        let mut dirty_element_ids = Vec::new();
        for (element_id, fragment) in &generated.fragments {
            let is_dirty = inner
                .fragments
                .get(element_id)
                .map(|existing| existing.source_hash != fragment.source_hash)
                .unwrap_or(true);
            if is_dirty {
                dirty_element_ids.push(element_id.clone());
            }
        }

        let previous_section_paths: HashSet<String> = inner
            .sections
            .values()
            .map(|section| section.file_path.clone())
            .collect();
        let next_section_paths: HashSet<String> = generated
            .sections
            .iter()
            .map(|section| section.file_path.clone())
            .collect();

        for stale_path in previous_section_paths.difference(&next_section_paths) {
            self.vfs.remove_path(stale_path);
        }

        let mut dirty_section_ids = Vec::new();
        let mut next_sections = HashMap::new();
        for mut section in generated.sections {
            let existing_source = self.vfs.read_source(&section.file_path).ok();
            if existing_source.as_deref() != Some(section.source.as_str()) {
                section.revision = self
                    .vfs
                    .write_source(&section.file_path, section.source.clone());
                dirty_section_ids.push(section.section_id.clone());
            } else {
                section.revision = self.vfs.source_revision(&section.file_path).unwrap_or(0);
            }
            next_sections.insert(section.section_id.clone(), section);
        }

        write_source_if_changed(&self.vfs, MAIN_PATH, &generated.main_source);
        write_source_if_changed(&self.vfs, REFERENCES_PATH, &generated.references_source);

        write_json_source(&self.vfs, DOCUMENT_STATE_PATH, &ast)?;
        write_json_source(&self.vfs, DEPENDENCY_MANIFEST_PATH, &ast.dependencies)?;
        write_json_source(
            &self.vfs,
            PROJECT_SETTINGS_PATH,
            &ast.metadata.project_settings,
        )?;
        write_source_if_changed(
            &self.vfs,
            TEMPLATE_PATH,
            &serde_json::json!({
                "template_id": ast.metadata.template_id,
                "title": ast.metadata.title,
            })
            .to_string(),
        );
        write_json_source(&self.vfs, SOURCE_MAP_PATH, &generated.source_map)?;
        write_json_source(
            &self.vfs,
            FIELD_SOURCE_MAP_PATH,
            &generated.field_source_map,
        )?;

        let status = DocumentSessionStatus {
            source_revision: self.vfs.latest_revision(),
            layout: generated.layout,
            source_map: generated.source_map.clone(),
            field_source_map: generated.field_source_map.clone(),
            dirty_section_ids,
            dirty_element_ids,
            fragment_count: generated.fragments.len(),
        };

        inner.ast = Some(ast);
        inner.fragments = generated.fragments;
        inner.sections = next_sections;
        inner.source_map = generated.source_map;
        inner.field_source_map = generated.field_source_map;
        inner.last_status = Some(status.clone());

        Ok(status)
    }

    pub fn status(&self) -> DocumentSessionStatus {
        self.inner
            .lock()
            .last_status
            .clone()
            .unwrap_or_else(|| DocumentSessionStatus {
                source_revision: self.vfs.latest_revision(),
                layout: default_layout(Vec::new()),
                source_map: Vec::new(),
                field_source_map: Vec::new(),
                dirty_section_ids: Vec::new(),
                dirty_element_ids: Vec::new(),
                fragment_count: 0,
            })
    }
}

fn write_json_source<T: Serialize>(
    vfs: &VirtualFileSystem,
    path: &str,
    value: &T,
) -> Result<u64, String> {
    let text = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    Ok(write_source_if_changed(vfs, path, &text))
}

fn write_source_if_changed(vfs: &VirtualFileSystem, path: &str, source: &str) -> u64 {
    match vfs.read_source(path) {
        Ok(existing) if existing == source => vfs.source_revision(path).unwrap_or(0),
        _ => vfs.write_source(path, source.to_string()),
    }
}

pub fn read_preview_svg_from_vfs(
    vfs: &VirtualFileSystem,
    path: &str,
) -> Result<String, DocumentSessionError> {
    if !path.starts_with(".ergproj/preview/svg/") {
        return Err(DocumentSessionError::InvalidPreviewPath);
    }

    let bytes = vfs.read_file(path).map_err(DocumentSessionError::Vfs)?;
    String::from_utf8(bytes).map_err(|error| DocumentSessionError::InvalidUtf8(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{
        Author, DocumentElement, DocumentSection, Equation, Figure, Paragraph, ProjectSettings,
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

        let status = session.sync_snapshot(basic_document_ast("Título con ñ", "")).unwrap();

        assert_eq!(status.layout.main_path, "main.typ");
        assert_eq!(status.layout.section_paths.len(), 2);
        assert!(vfs.read_source("main.typ").unwrap().contains("#include"));
        assert!(vfs
            .read_source("sections/content-section.typ")
            .unwrap()
            .contains("== Introducción <ergo-heading-1>"));
        assert!(status
            .source_map
            .iter()
            .any(|entry| entry.element_id == "heading-1"
                && entry.file_path == "sections/content-section.typ"));
    }

    #[test]
    fn status_includes_field_source_map_for_heading_text() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));

        let status = session.sync_snapshot(basic_document_ast("Título con ñ", "")).unwrap();
        let status_json = serde_json::to_value(status).unwrap();
        let field_map = status_json
            .get("fieldSourceMap")
            .and_then(serde_json::Value::as_array)
            .unwrap_or_else(|| panic!("fieldSourceMap missing from document session status"));

        assert!(field_map.iter().any(|entry| {
            entry.get("elementId") == Some(&serde_json::json!("heading-1"))
                && entry.get("fieldId") == Some(&serde_json::json!("heading-1:text"))
                && entry.get("filePath") == Some(&serde_json::json!("sections/content-section.typ"))
        }));
    }

    #[test]
    fn field_source_map_tracks_escaped_text_and_utf16_offsets() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = basic_document_ast("Título con ñ", "");

        if let DocumentSection::Content(content) = &mut ast.sections[1] {
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
            vfs.read_source("sections/content-section.typ").unwrap(),
            "== \\#Niñez 🌍 <ergo-heading-1>\n\n"
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

        if let DocumentSection::Content(content) = &mut ast.sections[1] {
            if let DocumentElement::Heading(heading) = &mut content.elements[0] {
                heading.content[0].text = "Método".to_string();
            }
        }

        let status = session.sync_snapshot(ast).unwrap();

        assert_eq!(status.dirty_section_ids, vec!["content-section"]);
        assert_eq!(status.dirty_element_ids, vec!["heading-1"]);
        assert!(vfs
            .read_source("sections/content-section.typ")
            .unwrap()
            .contains("Método"));
    }

    #[test]
    fn applies_paragraph_text_events_in_sequence() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = basic_document_ast("Título con ñ", "");
        if let DocumentSection::Content(content) = &mut ast.sections[1] {
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
            assert_eq!(status.dirty_element_ids, vec!["paragraph-1"]);
        }

        let source = vfs.read_source("sections/content-section.typ").unwrap();
        let state_json = vfs.read_source(".ergproj/document_state.json").unwrap();

        assert!(source.contains("Paso 10 con ñ"));
        assert!(!source.contains("Paso 9 con ñ"));
        assert!(state_json.contains("Paso 10 con ñ"));
    }

    #[test]
    fn applies_document_event_variants_to_backend_ast() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        session.sync_snapshot(basic_document_ast("Título con ñ", "")).unwrap();

        session
            .apply_event(DocumentEvent::SetProjectSettings {
                settings: ProjectSettings {
                    language: Some("es".to_string()),
                    ..ProjectSettings::default()
                },
            })
            .unwrap();
        session
            .apply_event(DocumentEvent::UpdateCoverAbstract {
                section_id: "cover-section".to_string(),
                text: "Resumen con ñ".to_string(),
            })
            .unwrap();
        session
            .apply_event(DocumentEvent::UpdateCoverAffiliations {
                section_id: "cover-section".to_string(),
                affiliations: vec!["Universidad".to_string()],
            })
            .unwrap();
        session
            .apply_event(DocumentEvent::InsertAuthor {
                section_id: "cover-section".to_string(),
                index: 0,
                author: Author {
                    name: "Ana".to_string(),
                    email: None,
                },
            })
            .unwrap();
        session
            .apply_event(DocumentEvent::UpdateAuthor {
                section_id: "cover-section".to_string(),
                author_index: 0,
                field: AuthorField::Email,
                value: "ana@example.com".to_string(),
            })
            .unwrap();
        session
            .apply_event(DocumentEvent::RestoreAuthor {
                section_id: "cover-section".to_string(),
                author_index: 1,
                author: Author {
                    name: "Luis".to_string(),
                    email: None,
                },
            })
            .unwrap();
        session
            .apply_event(DocumentEvent::RemoveAuthor {
                section_id: "cover-section".to_string(),
                author_index: 1,
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
                }))),
            })
            .unwrap();
        session
            .apply_event(DocumentEvent::UpdateFigure {
                element_id: "figure-1".to_string(),
                caption: Some("Figura con ñ".to_string()),
                placement: Some("top".to_string()),
                body_text: Some("Contenido de figura".to_string()),
            })
            .unwrap();

        let ast = persisted_ast(&vfs);

        assert_eq!(
            ast.metadata.project_settings.language.as_deref(),
            Some("es")
        );
        match &ast.sections[0] {
            DocumentSection::CoverPage(cover) => {
                assert_eq!(cover.abstract_text, "Resumen con ñ");
                assert_eq!(cover.affiliations, vec!["Universidad"]);
                assert_eq!(cover.authors[0].email.as_deref(), Some("ana@example.com"));
                assert_eq!(cover.authors.len(), 1);
            }
            _ => panic!("cover section missing"),
        }
        match &ast.sections[1] {
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
        let removed = match &ast.sections[1] {
            DocumentSection::Content(content) => content.elements[0].clone(),
            _ => panic!("content section missing"),
        };
        session.sync_snapshot(ast).unwrap();

        session
            .apply_event(DocumentEvent::RemoveElement {
                element_id: "heading-1".to_string(),
            })
            .unwrap();
        assert!(!vfs
            .read_source("sections/content-section.typ")
            .unwrap()
            .contains("Introducción"));

        session
            .apply_event(DocumentEvent::RestoreElement {
                section_id: "content-section".to_string(),
                index: 0,
                element: Box::new(removed),
            })
            .unwrap();
        assert!(vfs
            .read_source("sections/content-section.typ")
            .unwrap()
            .contains("Introducción"));
    }

    #[test]
    fn impossible_restore_element_does_not_mutate_document() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let ast = basic_document_ast("Título con ñ", "");
        let removed = match &ast.sections[1] {
            DocumentSection::Content(content) => content.elements[0].clone(),
            _ => panic!("content section missing"),
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
            .read_source("sections/content-section.typ")
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
            .contains("#bibliography(\"references.bib\")"));
    }
}
