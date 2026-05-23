use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::ast::{DocumentAST, DocumentElement, DocumentSection};
use crate::core_errors::DocumentSessionError;
use crate::document_session_events::apply_document_event;
use crate::document_session_generation::{
    default_layout, generate_project_sources_incremental,
};
pub use crate::document_session_types::{
    DocumentEvent, DocumentSessionStatus, FieldSourceMapEntry, FieldTextSegment, GeneratedFragment,
    ProjectSourceLayout, SourceMapEntry,
};
use crate::vfs::VirtualFileSystem;

pub(crate) const MAIN_PATH: &str = "main.typ";
pub(crate) const LIB_PATH: &str = "lib.typ";
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
    element_content_hashes: HashMap<String, u64>,
    source_map: Vec<SourceMapEntry>,
    field_source_map: Vec<FieldSourceMapEntry>,
    last_status: Option<DocumentSessionStatus>,
}

pub struct DocumentSession {
    vfs: Arc<VirtualFileSystem>,
    inner: Mutex<DocumentSessionInner>,
    status_snapshot: RwLock<DocumentSessionStatus>,
}

impl DocumentSession {
    pub fn new(vfs: Arc<VirtualFileSystem>) -> Self {
        Self {
            vfs,
            inner: Mutex::new(DocumentSessionInner::default()),
            status_snapshot: RwLock::new(DocumentSessionStatus {
                source_revision: 0,
                layout: default_layout(Vec::new()),
                source_map: Vec::new(),
                field_source_map: Vec::new(),
                dirty_element_ids: Vec::new(),
                fragment_count: 0,
                dirty_resource_ids: Vec::new(),
            }),
        }
    }

    pub fn status_snapshot(&self) -> DocumentSessionStatus {
        self.status_snapshot.read().clone()
    }

    pub fn sync_snapshot(&self, ast: DocumentAST) -> Result<DocumentSessionStatus, String> {
        let mut inner = self.inner.lock();
        let mut dirty_resource_ids = HashSet::new();
        if let Some(old_ast) = &inner.ast {
            // Find changed/new assets
            for asset in &ast.assets {
                let is_dirty = match old_ast.assets.iter().find(|a| a.id == asset.id) {
                    Some(old_asset) => old_asset != asset,
                    None => true,
                };
                if is_dirty {
                    dirty_resource_ids.insert(asset.id.clone());
                    dirty_resource_ids.extend(figure_ids_for_asset(&ast, &asset.id));
                }
            }
            // Find removed assets
            for old_asset in &old_ast.assets {
                if !ast.assets.iter().any(|a| a.id == old_asset.id) {
                    dirty_resource_ids.insert(old_asset.id.clone());
                    dirty_resource_ids.extend(figure_ids_for_asset(&ast, &old_asset.id));
                }
            }
        } else {
            // Initial sync: mark all resource IDs as dirty
            dirty_resource_ids = resource_ids_for_ast(&ast);
        }
        self.sync_ast_locked(&mut inner, ast, dirty_resource_ids)
    }

    pub fn apply_event(&self, event: DocumentEvent) -> Result<DocumentSessionStatus, String> {
        let mut inner = self.inner.lock();
        let mut ast = inner
            .ast
            .clone()
            .ok_or_else(|| "Document session has not been initialized".to_string())?;
        let dirty_resource_ids = dirty_resource_ids_for_event(&ast, &event);
        apply_document_event(&mut ast, event)?;
        self.sync_ast_locked(&mut inner, ast, dirty_resource_ids)
    }

    fn sync_ast_locked(
        &self,
        inner: &mut DocumentSessionInner,
        ast: DocumentAST,
        dirty_resource_ids: HashSet<String>,
    ) -> Result<DocumentSessionStatus, String> {
        let template_spec = crate::template_spec::load_bundled_template(&ast.metadata.template_id)?;
        let generated = generate_project_sources_incremental(
            &ast,
            &template_spec,
            &inner.fragments,
            &inner.element_content_hashes,
        );
        inner.element_content_hashes = generated.element_content_hashes;

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

        // Write per-element files
        let element_paths: HashSet<String> = generated.fragments
            .keys()
            .map(|id| element_vfs_path(id))
            .collect();
        let prev_element_paths: HashSet<String> = inner.fragments
            .keys()
            .map(|id| element_vfs_path(id))
            .collect();
        for stale_path in prev_element_paths.difference(&element_paths) {
            self.vfs.remove_path(stale_path);
        }

        for (element_id, fragment) in &generated.fragments {
            let path = element_vfs_path(element_id);
            if !self.vfs.is_source_equal(&path, &fragment.source) {
                self.vfs.write_source(&path, fragment.source.clone());
            }
        }

        write_source_if_changed(&self.vfs, MAIN_PATH, &generated.main_source);
        write_source_if_changed(&self.vfs, LIB_PATH, &generated.lib_source);
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

        inner.ast = Some(ast);
        inner.fragments = generated.fragments;
        inner.source_map = generated.source_map;
        inner.field_source_map = generated.field_source_map;

        let status = DocumentSessionStatus {
            source_revision: self.vfs.latest_revision(),
            layout: generated.layout,
            source_map: inner.source_map.clone(),
            field_source_map: inner.field_source_map.clone(),
            dirty_element_ids,
            fragment_count: inner.fragments.len(),
            dirty_resource_ids: dirty_resource_ids.into_iter().collect(),
        };

        inner.last_status = Some(status.clone());
        *self.status_snapshot.write() = status.clone();

        Ok(status)
    }

    pub fn status(&self) -> DocumentSessionStatus {
        self.status_snapshot.read().clone()
    }

    pub fn ast(&self) -> Option<DocumentAST> {
        self.inner.lock().ast.clone()
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

fn dirty_resource_ids_for_event(ast: &DocumentAST, event: &DocumentEvent) -> HashSet<String> {
    let mut ids = HashSet::new();
    match event {
        DocumentEvent::SetProjectSettings { .. } => {
            ids.extend(resource_ids_for_ast(ast));
        }
        DocumentEvent::InsertElement { element, .. }
        | DocumentEvent::RestoreElement { element, .. } => {
            if let Some(resource_id) = resource_id_for_element(element) {
                ids.insert(resource_id);
            }
        }
        DocumentEvent::RemoveElement { element_id } => {
            ids.insert(element_id.clone());
        }
        DocumentEvent::UpdateEquation { element_id, .. }
        | DocumentEvent::UpdateFigure { element_id, .. }
        | DocumentEvent::UpdateCustomElementField { element_id, .. } => {
            ids.insert(element_id.clone());
        }
        DocumentEvent::UpdateTableCell { table_id, .. }
        | DocumentEvent::InsertTableRow { table_id, .. }
        | DocumentEvent::RemoveTableRow { table_id, .. }
        | DocumentEvent::RestoreTableRow { table_id, .. }
        | DocumentEvent::InsertTableColumn { table_id, .. }
        | DocumentEvent::RemoveTableColumn { table_id, .. }
        | DocumentEvent::RestoreTableColumn { table_id, .. }
        | DocumentEvent::UpdateTableColumnSize { table_id, .. } => {
            ids.insert(table_id.clone());
        }
        DocumentEvent::UpdateElementExtraField { element_id, .. } => {
            if is_resource_element_id(ast, element_id) {
                ids.insert(element_id.clone());
            }
        }
        DocumentEvent::InsertAsset { asset, .. }
        | DocumentEvent::UpdateAsset { asset }
        | DocumentEvent::RestoreAsset { asset, .. } => {
            ids.insert(asset.id.clone());
            ids.extend(figure_ids_for_asset(ast, &asset.id));
        }
        DocumentEvent::RemoveAsset { asset_id } => {
            ids.insert(asset_id.clone());
            ids.extend(figure_ids_for_asset(ast, asset_id));
        }
        DocumentEvent::SetProjectTitle { .. }
        | DocumentEvent::UpdateInput { .. }
        | DocumentEvent::InsertInputArrayItem { .. }
        | DocumentEvent::RemoveInputArrayItem { .. }
        | DocumentEvent::UpdateParagraphText { .. }
        | DocumentEvent::UpdateHeading { .. }
        | DocumentEvent::InsertReference { .. }
        | DocumentEvent::UpdateReference { .. }
        | DocumentEvent::RemoveReference { .. }
        | DocumentEvent::RestoreReference { .. } => {}
    }
    ids
}

fn resource_ids_for_ast(ast: &DocumentAST) -> HashSet<String> {
    let mut ids = ast
        .assets
        .iter()
        .map(|asset| asset.id.clone())
        .collect::<HashSet<_>>();

    for element in ast.sections.iter().flat_map(section_elements) {
        if let Some(resource_id) = resource_id_for_element(element) {
            ids.insert(resource_id);
        }
    }

    ids
}

fn is_resource_element_id(ast: &DocumentAST, element_id: &str) -> bool {
    ast.sections
        .iter()
        .flat_map(section_elements)
        .any(|element| resource_id_for_element(element).as_deref() == Some(element_id))
}

fn resource_id_for_element(element: &DocumentElement) -> Option<String> {
    match element {
        DocumentElement::Table(table) => Some(table.id.clone()),
        DocumentElement::Equation(equation) => Some(equation.id.clone()),
        DocumentElement::Figure(figure) => Some(figure.id.clone()),
        DocumentElement::Custom(custom) => Some(custom.id.clone()),
        DocumentElement::Heading(_) | DocumentElement::Paragraph(_) => None,
    }
}

fn figure_ids_for_asset(ast: &DocumentAST, asset_id: &str) -> HashSet<String> {
    ast.sections
        .iter()
        .flat_map(section_elements)
        .filter_map(|element| match element {
            DocumentElement::Figure(figure) if figure.asset_id.as_deref() == Some(asset_id) => {
                Some(figure.id.clone())
            }
            _ => None,
        })
        .collect()
}

fn section_elements(section: &DocumentSection) -> &[DocumentElement] {
    let DocumentSection::Content(content) = section;
    &content.elements
}

fn element_vfs_path(element_id: &str) -> String {
    format!("elements/{}.typ", path_id_for_id(element_id))
}

fn path_id_for_id(id: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_dash = false;
    for character in id.to_lowercase().chars() {
        let next = if character.is_ascii_alphanumeric() || character == '_' {
            Some(character)
        } else {
            Some('-')
        };
        if let Some(character) = next {
            if character == '-' {
                if !previous_was_dash {
                    normalized.push(character);
                }
                previous_was_dash = true;
            } else {
                normalized.push(character);
                previous_was_dash = false;
            }
        }
    }
    normalized.trim_matches('-').to_string()
}

fn write_source_if_changed(vfs: &VirtualFileSystem, path: &str, source: &str) -> u64 {
    if vfs.is_source_equal(path, source) {
        vfs.source_revision(path).unwrap_or(0)
    } else {
        vfs.write_source(path, source.to_string())
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
#[allow(irrefutable_let_patterns, unreachable_patterns)]
mod tests {
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
        assert!(status
            .source_map
            .iter()
            .any(|entry| entry.element_id == "heading-1"
                && entry.file_path == "elements/heading-1.typ"));
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
        assert!(!main_source.contains("authors:"));
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
        ast.inputs
            .insert("running_head".to_string(), serde_json::json!("CABEZA"));

        let status = session.sync_snapshot(ast).unwrap();

        for field_id in ["/title", "/running_head"] {
            let expected_file = if field_id == "/title" { "main.typ" } else { "lib.typ" };
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
            assert!(
                status
                    .dirty_element_ids
                    .iter()
                    .any(|element_id| element_id == "paragraph-1"),
            );
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
            .contains("#bibliography(\"references.bib\""));
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
            content.elements.push(DocumentElement::Figure(Box::new(fig)));
        }
        
        let status = session.sync_snapshot(ast.clone()).unwrap();
        assert!(status.dirty_resource_ids.contains(&"eq-1".to_string()));
        assert!(status.dirty_resource_ids.contains(&"fig-1".to_string()));
        assert!(status.dirty_resource_ids.contains(&"asset-1".to_string()));

        let status_event = session.apply_event(DocumentEvent::UpdateEquation {
            element_id: "eq-1".to_string(),
            latex_source: Some("F = ma".to_string()),
            is_block: None,
        }).unwrap();
        
        assert!(status_event.dirty_resource_ids.contains(&"eq-1".to_string()));
        assert!(!status_event.dirty_resource_ids.contains(&"fig-1".to_string()));
        assert!(!status_event.dirty_resource_ids.contains(&"asset-1".to_string()));

        let mut updated_ast = session.ast().unwrap();
        updated_ast.assets[0].caption = Some("New Caption".to_string());
        
        let status_sync = session.sync_snapshot(updated_ast).unwrap();
        assert!(status_sync.dirty_resource_ids.contains(&"asset-1".to_string()));
        assert!(status_sync.dirty_resource_ids.contains(&"fig-1".to_string()));
        assert!(!status_sync.dirty_resource_ids.contains(&"eq-1".to_string()));
    }
}
