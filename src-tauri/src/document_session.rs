use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use tauri::State;
use ts_rs::TS;

use crate::ast::{
    DocumentAST, DocumentElement, DocumentSection, ProjectSettings, ReferenceEntry, RichText,
};
use crate::compiler::TauriAppState;
use crate::vfs::VirtualFileSystem;

const MAIN_PATH: &str = "main.typ";
const REFERENCES_PATH: &str = "references.bib";
const DOCUMENT_STATE_PATH: &str = ".ergproj/document_state.json";
const DEPENDENCY_MANIFEST_PATH: &str = ".ergproj/dependency_manifest.json";
const PROJECT_SETTINGS_PATH: &str = ".ergproj/project_settings.json";
const TEMPLATE_PATH: &str = ".ergproj/template.json";
const SOURCE_MAP_PATH: &str = ".ergproj/source_map.json";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct SourceMapEntry {
    pub element_id: String,
    pub section_id: String,
    pub file_path: String,
    pub start: usize,
    pub end: usize,
    pub byte_start: usize,
    pub byte_end: usize,
    pub label: String,
    #[serde(default)]
    pub page: Option<usize>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct GeneratedFragment {
    pub element_id: String,
    pub section_id: String,
    pub kind: String,
    pub source: String,
    pub source_hash: u64,
    pub dependencies: Vec<String>,
    pub source_map_ranges: Vec<SourceMapEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct SectionSource {
    pub section_id: String,
    pub file_path: String,
    pub source: String,
    pub fragment_ids: Vec<String>,
    pub revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct ProjectSourceLayout {
    pub main_path: String,
    pub section_paths: Vec<String>,
    pub references_path: String,
    pub source_map_path: String,
    pub document_state_path: String,
    pub project_settings_path: String,
    pub template_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct DocumentSessionStatus {
    pub source_revision: u64,
    pub layout: ProjectSourceLayout,
    pub source_map: Vec<SourceMapEntry>,
    pub dirty_section_ids: Vec<String>,
    pub dirty_element_ids: Vec<String>,
    pub fragment_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DocumentEvent {
    SnapshotSynced { ast: Box<DocumentAST> },
}

#[derive(Default)]
struct DocumentSessionInner {
    ast: Option<DocumentAST>,
    fragments: HashMap<String, GeneratedFragment>,
    sections: HashMap<String, SectionSource>,
    source_map: Vec<SourceMapEntry>,
    last_status: Option<DocumentSessionStatus>,
}

pub struct DocumentSession {
    vfs: Arc<VirtualFileSystem>,
    inner: Mutex<DocumentSessionInner>,
}

struct GeneratedProjectSources {
    main_source: String,
    references_source: String,
    sections: Vec<SectionSource>,
    fragments: HashMap<String, GeneratedFragment>,
    source_map: Vec<SourceMapEntry>,
    layout: ProjectSourceLayout,
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

        let status = DocumentSessionStatus {
            source_revision: self.vfs.latest_revision(),
            layout: generated.layout,
            source_map: generated.source_map.clone(),
            dirty_section_ids,
            dirty_element_ids,
            fragment_count: generated.fragments.len(),
        };

        inner.ast = Some(ast);
        inner.fragments = generated.fragments;
        inner.sections = next_sections;
        inner.source_map = generated.source_map;
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
                dirty_section_ids: Vec::new(),
                dirty_element_ids: Vec::new(),
                fragment_count: 0,
            })
    }
}

fn generate_project_sources(ast: &DocumentAST) -> GeneratedProjectSources {
    let mut sections = Vec::new();
    let mut fragments = HashMap::new();
    let mut source_map = Vec::new();

    for section in &ast.sections {
        let section_id = section_id(section);
        let file_path = section_path(&section_id);
        let mut source = String::new();
        let mut fragment_ids = Vec::new();

        match section {
            DocumentSection::CoverPage(cover_page) => {
                let fragment = cover_page_fragment(ast, cover_page.id.clone(), file_path.clone());
                source.push_str(&fragment.source);
                source_map.extend(fragment.source_map_ranges.clone());
                fragment_ids.push(fragment.element_id.clone());
                fragments.insert(fragment.element_id.clone(), fragment);
            }
            DocumentSection::Content(content) => {
                for element in &content.elements {
                    let start = source.len();
                    let fragment = element_fragment(element, &content.id, &file_path, start);
                    if !fragment.source.is_empty() {
                        source.push_str(&fragment.source);
                        source_map.extend(fragment.source_map_ranges.clone());
                    }
                    fragment_ids.push(fragment.element_id.clone());
                    fragments.insert(fragment.element_id.clone(), fragment);
                }
            }
        }

        sections.push(SectionSource {
            section_id,
            file_path,
            source,
            fragment_ids,
            revision: 0,
        });
    }

    let section_paths = sections
        .iter()
        .map(|section| section.file_path.clone())
        .collect::<Vec<_>>();
    let layout = default_layout(section_paths);
    let main_source = generate_main_source(ast, &sections);
    let references_source = generate_references_bib(&ast.references);

    GeneratedProjectSources {
        main_source,
        references_source,
        sections,
        fragments,
        source_map,
        layout,
    }
}

fn generate_main_source(ast: &DocumentAST, sections: &[SectionSource]) -> String {
    let mut source = generate_preamble_typst(&ast.metadata.project_settings);

    for section in sections {
        source.push_str(&format!("#include \"{}\"\n\n", section.file_path));
    }

    if !ast.references.is_empty() {
        source.push_str("#bibliography(\"references.bib\")\n");
    }

    source
}

fn cover_page_fragment(
    ast: &DocumentAST,
    section_id: String,
    file_path: String,
) -> GeneratedFragment {
    let title = escape_typst_text(if ast.metadata.title.trim().is_empty() {
        "Untitled Document"
    } else {
        ast.metadata.title.trim()
    });
    let label = label_for_id(&section_id);

    let cover_page = ast.sections.iter().find_map(|section| match section {
        DocumentSection::CoverPage(cover_page) if cover_page.id == section_id => Some(cover_page),
        _ => None,
    });

    let source = if let Some(cover_page) = cover_page {
        let authors = cover_page
            .authors
            .iter()
            .map(|author| {
                let email = author
                    .email
                    .as_ref()
                    .filter(|value| !value.trim().is_empty())
                    .map(|email| format!(" ({email})"))
                    .unwrap_or_default();
                escape_typst_text(format!("{}{}", author.name, email).trim())
            })
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        let affiliations = cover_page
            .affiliations
            .iter()
            .map(|affiliation| escape_typst_text(affiliation))
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>();
        let abstract_text = escape_typst_text(cover_page.abstract_text.trim());

        let mut lines = vec![format!("#text(size: 18pt, weight: \"bold\")[{title}]")];
        lines.extend(authors);
        lines.extend(affiliations);

        let abstract_block = if abstract_text.is_empty() {
            String::new()
        } else {
            format!("#block[\n  #strong[Abstract]\n\n  {abstract_text}\n]\n\n")
        };

        format!(
            "#align(center)[\n  {}\n] <{}>\n\n{}",
            lines.join("\n\n  "),
            label,
            abstract_block
        )
    } else {
        format!(
            "#align(center)[#text(size: 18pt, weight: \"bold\")[{title}]] <{}>\n\n",
            label
        )
    };

    let source_map_entry = SourceMapEntry {
        element_id: section_id.clone(),
        section_id: section_id.clone(),
        file_path,
        start: 0,
        end: source.len(),
        byte_start: 0,
        byte_end: source.len(),
        label,
        page: None,
    };

    GeneratedFragment {
        element_id: section_id.clone(),
        section_id,
        kind: "CoverPage".to_string(),
        source_hash: hash_source(&source),
        source,
        dependencies: Vec::new(),
        source_map_ranges: vec![source_map_entry],
    }
}

fn element_fragment(
    element: &DocumentElement,
    section_id: &str,
    file_path: &str,
    section_start: usize,
) -> GeneratedFragment {
    let element_id = element_id(element);
    let kind = element_kind(element);
    let label = label_for_id(&element_id);
    let source = generate_element_typst(element, &label);
    let source_map_ranges = if source.is_empty() {
        Vec::new()
    } else {
        vec![SourceMapEntry {
            element_id: element_id.clone(),
            section_id: section_id.to_string(),
            file_path: file_path.to_string(),
            start: section_start,
            end: section_start + source.len(),
            byte_start: section_start,
            byte_end: section_start + source.len(),
            label,
            page: None,
        }]
    };

    GeneratedFragment {
        element_id,
        section_id: section_id.to_string(),
        kind: kind.to_string(),
        source_hash: hash_source(&source),
        source,
        dependencies: Vec::new(),
        source_map_ranges,
    }
}

fn generate_element_typst(element: &DocumentElement, label: &str) -> String {
    match element {
        DocumentElement::Heading(heading) => {
            let level = heading.level.clamp(1, 5) as usize;
            let marker = "=".repeat(level);
            let title = rich_text_to_typst(&heading.content);
            let title = if title.trim().is_empty() {
                "Untitled heading".to_string()
            } else {
                title.trim().to_string()
            };

            format!("{marker} {title} <{label}>\n\n")
        }
        DocumentElement::Paragraph(paragraph) => {
            let body = rich_text_to_typst(&paragraph.content);
            let body = body.trim();
            if body.is_empty() {
                String::new()
            } else {
                format!("{body} <{label}>\n\n")
            }
        }
        DocumentElement::Equation(equation) => {
            let source = normalize_math_source(&equation.latex_source);
            if source.is_empty() {
                String::new()
            } else if equation.is_block {
                format!("$ {source} $ <{label}>\n\n")
            } else {
                format!("${source}$ <{label}>\n\n")
            }
        }
        DocumentElement::Table(table) => {
            let columns = table
                .column_sizes
                .iter()
                .map(|size| sanitize_table_column_size(size))
                .collect::<Vec<_>>()
                .join(", ");
            let columns = if columns.is_empty() {
                "1fr".to_string()
            } else {
                columns
            };
            let cells = table
                .cells
                .iter()
                .flat_map(|row| {
                    row.iter()
                        .map(|cell| format!("[{}]", escape_typst_text(&cell.content)))
                })
                .collect::<Vec<_>>()
                .join(",\n  ");

            format!("#table(\n  columns: ({columns}),\n  {cells}\n) <{label}>\n\n")
        }
        DocumentElement::Figure(figure) => {
            let body = match &figure.content {
                DocumentElement::Paragraph(paragraph) => rich_text_to_typst(&paragraph.content),
                _ => String::new(),
            };
            let caption = escape_typst_text(figure.caption.trim());
            let placement = sanitize_placement(&figure.placement);
            let asset_path = figure
                .asset_id
                .as_ref()
                .filter(|asset_id| !asset_id.trim().is_empty())
                .map(|asset_id| format!("assets/{}", path_id_for_id(asset_id)));

            if body.trim().is_empty() && caption.is_empty() && asset_path.is_none() {
                return String::new();
            }

            let caption_line = if caption.is_empty() {
                String::new()
            } else {
                format!(",\n  caption: [{caption}]")
            };
            let figure_body = asset_path
                .map(|path| format!("#image(\"{}\")", escape_typst_string(&path)))
                .unwrap_or_else(|| {
                    if body.trim().is_empty() {
                        "Figure content".to_string()
                    } else {
                        body.trim().to_string()
                    }
                });

            format!(
                "#figure(\n  [{figure_body}]{caption_line},\n  placement: {placement}\n) <{label}>\n\n"
            )
        }
    }
}

fn generate_preamble_typst(settings: &ProjectSettings) -> String {
    let defaults = ProjectSettings::default();
    let paper_size = settings
        .paper_size
        .as_ref()
        .or(defaults.paper_size.as_ref())
        .map(String::as_str)
        .unwrap_or("us-letter");
    let text_font = settings
        .text_font
        .as_ref()
        .or(defaults.text_font.as_ref())
        .map(String::as_str)
        .unwrap_or("Libertinus Serif");
    let font_size = settings.font_size.or(defaults.font_size).unwrap_or(11.0);

    format!(
        "#set page(paper: \"{}\")\n#set text(font: \"{}\", size: {}pt)\n\n",
        escape_typst_string(paper_size),
        escape_typst_string(text_font),
        font_size
    )
}

fn generate_references_bib(references: &[ReferenceEntry]) -> String {
    if references.is_empty() {
        return String::new();
    }

    let mut source = references
        .iter()
        .map(|reference| reference.biblatex.trim())
        .filter(|biblatex| !biblatex.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if !source.ends_with('\n') {
        source.push('\n');
    }

    source
}

fn rich_text_to_typst(content: &[RichText]) -> String {
    content.iter().map(rich_text_span_to_typst).collect()
}

fn rich_text_span_to_typst(span: &RichText) -> String {
    if span.kind.as_deref() == Some("reference") {
        if let Some(reference_id) = span.reference_id.as_deref() {
            return format!("@{}", label_for_id(reference_id));
        }
    }

    if span.kind.as_deref() == Some("inlineEquation") {
        if let Some(equation_source) = span.equation_source.as_deref() {
            let source = normalize_math_source(equation_source);
            return if source.is_empty() {
                String::new()
            } else {
                format!("${source}$")
            };
        }
    }

    let text = escape_typst_text(&span.text);
    match (span.bold.unwrap_or(false), span.italic.unwrap_or(false)) {
        (true, true) => format!("*_{text}_*"),
        (true, false) => format!("*{text}*"),
        (false, true) => format!("_{text}_"),
        (false, false) => text,
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

fn default_layout(section_paths: Vec<String>) -> ProjectSourceLayout {
    ProjectSourceLayout {
        main_path: MAIN_PATH.to_string(),
        section_paths,
        references_path: REFERENCES_PATH.to_string(),
        source_map_path: SOURCE_MAP_PATH.to_string(),
        document_state_path: DOCUMENT_STATE_PATH.to_string(),
        project_settings_path: PROJECT_SETTINGS_PATH.to_string(),
        template_path: TEMPLATE_PATH.to_string(),
    }
}

fn section_id(section: &DocumentSection) -> String {
    match section {
        DocumentSection::Content(content) => content.id.clone(),
        DocumentSection::CoverPage(cover_page) => cover_page.id.clone(),
    }
}

fn section_path(section_id: &str) -> String {
    format!("sections/{}.typ", path_id_for_id(section_id))
}

fn element_id(element: &DocumentElement) -> String {
    match element {
        DocumentElement::Heading(heading) => heading.id.clone(),
        DocumentElement::Paragraph(paragraph) => paragraph.id.clone(),
        DocumentElement::Table(table) => table.id.clone(),
        DocumentElement::Equation(equation) => equation.id.clone(),
        DocumentElement::Figure(figure) => figure.id.clone(),
    }
}

fn element_kind(element: &DocumentElement) -> &'static str {
    match element {
        DocumentElement::Heading(_) => "Heading",
        DocumentElement::Paragraph(_) => "Paragraph",
        DocumentElement::Table(_) => "Table",
        DocumentElement::Equation(_) => "Equation",
        DocumentElement::Figure(_) => "Figure",
    }
}

fn label_for_id(id: &str) -> String {
    let normalized = path_id_for_id(id);
    if normalized.is_empty() {
        "ergo-element".to_string()
    } else {
        format!("ergo-{normalized}")
    }
}

fn path_id_for_id(id: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_dash = false;

    for character in id.to_lowercase().chars() {
        let next = if character.is_ascii_alphanumeric() || character == '_' {
            Some(character)
        } else if character == '-' {
            Some('-')
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

fn escape_typst_text(value: impl AsRef<str>) -> String {
    value
        .as_ref()
        .chars()
        .flat_map(|character| match character {
            '\\' | '#' | '$' | '%' | '&' | '_' | '^' | '{' | '}' | '[' | ']' => {
                vec!['\\', character]
            }
            _ => vec![character],
        })
        .collect()
}

fn escape_typst_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn sanitize_table_column_size(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "auto" || is_sized_unit(trimmed) {
        trimmed.to_string()
    } else {
        "1fr".to_string()
    }
}

fn is_sized_unit(value: &str) -> bool {
    let units = ["fr", "pt", "mm", "cm", "in", "em", "%"];
    units.iter().any(|unit| {
        value
            .strip_suffix(unit)
            .and_then(|number| number.parse::<f32>().ok())
            .is_some()
    })
}

fn sanitize_placement(value: &str) -> &'static str {
    match value {
        "top" => "top",
        "bottom" => "bottom",
        _ => "auto",
    }
}

fn normalize_math_source(value: &str) -> String {
    value.trim().trim_matches('$').trim().to_string()
}

fn hash_source(source: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    hasher.finish()
}

#[tauri::command]
pub fn sync_document_snapshot(
    state: State<'_, TauriAppState>,
    ast: DocumentAST,
) -> Result<DocumentSessionStatus, String> {
    let status = state.document_session.sync_snapshot(ast)?;
    state
        .compilation_queue
        .mark_source_revision(status.source_revision);
    Ok(status)
}

#[tauri::command]
pub fn sync_document_event(
    state: State<'_, TauriAppState>,
    event: DocumentEvent,
) -> Result<DocumentSessionStatus, String> {
    let status = match event {
        DocumentEvent::SnapshotSynced { ast } => state.document_session.sync_snapshot(*ast),
    }?;
    state
        .compilation_queue
        .mark_source_revision(status.source_revision);
    Ok(status)
}

#[tauri::command]
pub fn get_document_session_status(
    state: State<'_, TauriAppState>,
) -> Result<DocumentSessionStatus, String> {
    Ok(state.document_session.status())
}

#[tauri::command]
pub fn read_preview_svg(state: State<'_, TauriAppState>, path: String) -> Result<String, String> {
    if !path.starts_with(".ergproj/preview/svg/") {
        return Err("Preview SVG path must be inside .ergproj/preview/svg".to_string());
    }

    state.vfs.read_source(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{
        ContentSection, CoverPageSection, DependencyManifest, GlobalSettings, Heading,
        ProjectMetadata, RichText,
    };

    fn test_ast() -> DocumentAST {
        DocumentAST {
            version: "1.0".to_string(),
            metadata: ProjectMetadata {
                template_id: "apa7".to_string(),
                title: "Título con ñ".to_string(),
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
                    abstract_text: String::new(),
                }),
                DocumentSection::Content(ContentSection {
                    id: "content-section".to_string(),
                    is_optional: false,
                    elements: vec![DocumentElement::Heading(Heading {
                        id: "heading-1".to_string(),
                        level: 2,
                        content: vec![RichText {
                            text: "Introducción".to_string(),
                            bold: None,
                            italic: None,
                            kind: None,
                            reference_id: None,
                            equation_source: None,
                        }],
                    })],
                }),
            ],
        }
    }

    #[test]
    fn generates_main_and_section_files() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));

        let status = session.sync_snapshot(test_ast()).unwrap();

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
    fn marks_only_changed_section_dirty_on_text_edit() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = test_ast();
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
    fn writes_references_bib_from_reference_entries() {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let mut ast = test_ast();
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
