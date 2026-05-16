use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::ast::{DocumentAST, DocumentElement, DocumentSection, ProjectSettings, ReferenceEntry, RichText};
use crate::document_source_builder::SourceBuilder;
use crate::document_session::{
    DOCUMENT_STATE_PATH, FIELD_SOURCE_MAP_PATH, MAIN_PATH, PROJECT_SETTINGS_PATH,
    REFERENCES_PATH, SOURCE_MAP_PATH, TEMPLATE_PATH,
};
use crate::document_session_types::{
    FieldSourceMapEntry, GeneratedFragment, ProjectSourceLayout, SectionSource, SourceMapEntry,
};

pub(crate) struct GeneratedProjectSources {
    pub(crate) main_source: String,
    pub(crate) references_source: String,
    pub(crate) sections: Vec<SectionSource>,
    pub(crate) fragments: HashMap<String, GeneratedFragment>,
    pub(crate) source_map: Vec<SourceMapEntry>,
    pub(crate) field_source_map: Vec<FieldSourceMapEntry>,
    pub(crate) layout: ProjectSourceLayout,
}

pub(crate) fn default_layout(section_paths: Vec<String>) -> ProjectSourceLayout {
    ProjectSourceLayout {
        main_path: MAIN_PATH.to_string(),
        section_paths,
        references_path: REFERENCES_PATH.to_string(),
        source_map_path: SOURCE_MAP_PATH.to_string(),
        field_source_map_path: FIELD_SOURCE_MAP_PATH.to_string(),
        document_state_path: DOCUMENT_STATE_PATH.to_string(),
        project_settings_path: PROJECT_SETTINGS_PATH.to_string(),
        template_path: TEMPLATE_PATH.to_string(),
    }
}

pub(crate) fn generate_project_sources(ast: &DocumentAST) -> GeneratedProjectSources {
    let mut sections = Vec::new();
    let mut fragments = HashMap::new();
    let mut source_map = Vec::new();
    let mut field_source_map = Vec::new();

    for section in &ast.sections {
        let section_id = section_id(section);
        let file_path = section_path(&section_id);
        let mut source = String::new();
        let mut fragment_ids = Vec::new();
        let mut char_offset = 0;

        match section {
            DocumentSection::CoverPage(cover_page) => {
                let fragment = cover_page_fragment(ast, cover_page.id.clone(), file_path.clone());
                source.push_str(&fragment.source);
                source_map.extend(fragment.source_map_ranges.clone());
                field_source_map.extend(fragment.field_source_map_ranges.clone());
                fragment_ids.push(fragment.element_id.clone());
                fragments.insert(fragment.element_id.clone(), fragment);
            }
            DocumentSection::Content(content) => {
                for element in &content.elements {
                    let start_byte = source.len();
                    let start_char = char_offset;
                    let fragment =
                        element_fragment(element, &content.id, &file_path, start_byte, start_char);
                    if !fragment.source.is_empty() {
                        source.push_str(&fragment.source);
                        char_offset += fragment.source.chars().count();
                        source_map.extend(fragment.source_map_ranges.clone());
                        field_source_map.extend(fragment.field_source_map_ranges.clone());
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
        field_source_map,
        layout,
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

fn rich_text_field_id(element_id: &str) -> String {
    format!("{element_id}:text")
}

fn cover_title_field_id(section_id: &str) -> String {
    format!("{section_id}:title")
}

fn cover_abstract_field_id(section_id: &str) -> String {
    format!("{section_id}:abstract")
}

fn cover_affiliations_field_id(section_id: &str) -> String {
    format!("{section_id}:affiliations")
}

fn cover_author_name_field_id(section_id: &str, author_index: usize) -> String {
    format!("{section_id}:author:{author_index}:name")
}

fn cover_author_email_field_id(section_id: &str, author_index: usize) -> String {
    format!("{section_id}:author:{author_index}:email")
}

fn equation_source_field_id(element_id: &str) -> String {
    format!("{element_id}:latexSource")
}

fn table_cell_field_id(element_id: &str, row_index: usize, col_index: usize) -> String {
    format!("{element_id}:cell:{row_index}:{col_index}")
}

fn figure_body_field_id(element_id: &str) -> String {
    format!("{element_id}:body")
}

fn figure_caption_field_id(element_id: &str) -> String {
    format!("{element_id}:caption")
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
    let label = label_for_id(&section_id);

    let cover_page = ast.sections.iter().find_map(|section| match section {
        DocumentSection::CoverPage(cover_page) if cover_page.id == section_id => Some(cover_page),
        _ => None,
    });

    let mut builder = SourceBuilder::default();
    builder.push_literal("#align(center)[\n  #text(size: 18pt, weight: \"bold\")[");
    push_trimmed_or_generated_field(
        &mut builder,
        &section_id,
        &cover_title_field_id(&section_id),
        &ast.metadata.title,
        "Untitled Document",
    );
    builder.push_literal("]");

    if let Some(cover_page) = cover_page {
        for (index, author) in cover_page.authors.iter().enumerate() {
            let name = author.name.trim();
            let email = author.email.as_deref().unwrap_or("").trim();
            if name.is_empty() && email.is_empty() {
                continue;
            }

            builder.push_literal("\n\n  ");
            if name.is_empty() {
                builder.push_generated_field_marker(
                    &section_id,
                    &cover_author_name_field_id(&section_id, index),
                    "",
                    0,
                );
            } else {
                builder.push_escaped_field(
                    &section_id,
                    &cover_author_name_field_id(&section_id, index),
                    name,
                    0,
                );
            }
            if !email.is_empty() {
                builder.push_literal(" (");
                builder.push_escaped_field(
                    &section_id,
                    &cover_author_email_field_id(&section_id, index),
                    email,
                    0,
                );
                builder.push_literal(")");
            }
        }

        let mut affiliation_utf16_offset = 0;
        for affiliation in cover_page
            .affiliations
            .iter()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            builder.push_literal("\n\n  ");
            builder.push_escaped_field(
                &section_id,
                &cover_affiliations_field_id(&section_id),
                affiliation,
                affiliation_utf16_offset,
            );
            affiliation_utf16_offset += affiliation.chars().map(char::len_utf16).sum::<usize>() + 1;
        }
    }

    builder.push_literal(&format!("\n] <{}>\n\n", label));

    if let Some(cover_page) = cover_page {
        if !cover_page.abstract_text.trim().is_empty() {
            builder.push_literal("#block[\n  #strong[Abstract]\n\n  ");
            builder.push_escaped_field(
                &section_id,
                &cover_abstract_field_id(&section_id),
                cover_page.abstract_text.trim(),
                0,
            );
            builder.push_literal("\n]\n\n");
        }
    }

    let source = builder.source.clone();
    let field_source_map_ranges = builder.into_absolute_field_ranges(&section_id, &file_path, 0);

    let source_map_entry = SourceMapEntry {
        element_id: section_id.clone(),
        section_id: section_id.clone(),
        file_path,
        start: 0,
        end: source.chars().count(),
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
        field_source_map_ranges,
    }
}

fn element_fragment(
    element: &DocumentElement,
    section_id: &str,
    file_path: &str,
    section_byte_start: usize,
    section_char_start: usize,
) -> GeneratedFragment {
    let element_id = element_id(element);
    let kind = element_kind(element);
    let label = label_for_id(&element_id);
    let builder = generate_element_typst(element, &label);
    let source = builder.source.clone();
    let field_source_map_ranges =
        builder.into_absolute_field_ranges(section_id, file_path, section_byte_start);
    let source_map_ranges = if source.is_empty() {
        Vec::new()
    } else {
        vec![SourceMapEntry {
            element_id: element_id.clone(),
            section_id: section_id.to_string(),
            file_path: file_path.to_string(),
            start: section_char_start,
            end: section_char_start + source.chars().count(),
            byte_start: section_byte_start,
            byte_end: section_byte_start + source.len(),
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
        field_source_map_ranges,
    }
}

fn generate_element_typst(element: &DocumentElement, label: &str) -> SourceBuilder {
    let mut builder = SourceBuilder::default();
    match element {
        DocumentElement::Heading(heading) => {
            let level = heading.level.clamp(1, 5) as usize;
            let marker = "=".repeat(level);
            let element_id = &heading.id;
            let field_id = rich_text_field_id(element_id);
            builder.push_literal(&format!("{marker} "));

            let mut title = SourceBuilder::default();
            push_rich_text_field(&mut title, element_id, &field_id, &heading.content);
            if title.source.trim().is_empty() {
                builder.push_generated_field_marker(element_id, &field_id, "Untitled heading", 0);
            } else {
                builder.push_builder(title);
            }
            builder.push_literal(&format!(" <{label}>\n\n"));
        }
        DocumentElement::Paragraph(paragraph) => {
            let element_id = &paragraph.id;
            let field_id = rich_text_field_id(element_id);
            push_rich_text_field(&mut builder, element_id, &field_id, &paragraph.content);
            if builder.source.trim().is_empty() {
                builder.clear();
            } else {
                builder.push_literal(&format!(" <{label}>\n\n"));
            }
        }
        DocumentElement::Equation(equation) => {
            let source = normalize_math_source(&equation.latex_source);
            if !source.is_empty() {
                let field_id = equation_source_field_id(&equation.id);
                if equation.is_block {
                    builder.push_literal("$ ");
                    builder.push_raw_field(&equation.id, &field_id, &source, 0);
                    builder.push_literal(&format!(" $ <{label}>\n\n"));
                } else {
                    builder.push_literal("$");
                    builder.push_raw_field(&equation.id, &field_id, &source, 0);
                    builder.push_literal(&format!("$ <{label}>\n\n"));
                }
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

            builder.push_literal(&format!("#table(\n  columns: ({columns})"));
            for (row_index, row) in table.cells.iter().enumerate() {
                for (col_index, cell) in row.iter().enumerate() {
                    builder.push_literal(",\n  [");
                    builder.push_escaped_field(
                        &table.id,
                        &table_cell_field_id(&table.id, row_index, col_index),
                        &cell.content,
                        0,
                    );
                    builder.push_literal("]");
                }
            }
            builder.push_literal(&format!("\n) <{label}>\n\n"));
        }
        DocumentElement::Figure(figure) => {
            let mut body = SourceBuilder::default();
            if let DocumentElement::Paragraph(paragraph) = &figure.content {
                push_rich_text_field(
                    &mut body,
                    &figure.id,
                    &figure_body_field_id(&figure.id),
                    &paragraph.content,
                );
            }
            let caption = figure.caption.trim();
            let placement = sanitize_placement(&figure.placement);
            let asset_path = figure
                .asset_id
                .as_ref()
                .filter(|asset_id| !asset_id.trim().is_empty())
                .map(|asset_id| format!("assets/{}", path_id_for_id(asset_id)));

            if body.source.trim().is_empty() && caption.is_empty() && asset_path.is_none() {
                return builder;
            }

            builder.push_literal("#figure(\n  [");
            if let Some(path) = asset_path {
                builder.push_generated_field_marker(
                    &figure.id,
                    &figure_body_field_id(&figure.id),
                    &format!("#image(\"{}\")", escape_typst_string(&path)),
                    0,
                );
            } else if body.source.trim().is_empty() {
                builder.push_generated_field_marker(
                    &figure.id,
                    &figure_body_field_id(&figure.id),
                    "Figure content",
                    0,
                );
            } else {
                builder.push_builder(body);
            }
            builder.push_literal("]");
            if !caption.is_empty() {
                builder.push_literal(",\n  caption: [");
                builder.push_escaped_field(
                    &figure.id,
                    &figure_caption_field_id(&figure.id),
                    caption,
                    0,
                );
                builder.push_literal("]");
            }
            builder.push_literal(&format!(",\n  placement: {placement}\n) <{label}>\n\n"));
        }
    };
    builder
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

fn push_trimmed_or_generated_field(
    builder: &mut SourceBuilder,
    element_id: &str,
    field_id: &str,
    value: &str,
    fallback: &str,
) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        builder.push_generated_field_marker(element_id, field_id, fallback, 0);
    } else {
        builder.push_escaped_field(element_id, field_id, trimmed, 0);
    }
}

fn push_rich_text_field(
    builder: &mut SourceBuilder,
    element_id: &str,
    field_id: &str,
    content: &[RichText],
) {
    let mut field_utf16_offset = 0;

    for span in content {
        if span.kind.as_deref() == Some("reference") {
            if let Some(reference_id) = span.reference_id.as_deref() {
                builder.push_generated_field_marker(
                    element_id,
                    field_id,
                    &format!("@{}", label_for_id(reference_id)),
                    field_utf16_offset,
                );
            }
            continue;
        }

        if span.kind.as_deref() == Some("inlineEquation") {
            if let Some(equation_source) = span.equation_source.as_deref() {
                let source = normalize_math_source(equation_source);
                if !source.is_empty() {
                    builder.push_generated_field_marker(
                        element_id,
                        field_id,
                        &format!("${source}$"),
                        field_utf16_offset,
                    );
                }
            }
            continue;
        }

        let (prefix, suffix) = match (span.bold.unwrap_or(false), span.italic.unwrap_or(false)) {
            (true, true) => ("*_", "_*"),
            (true, false) => ("*", "*"),
            (false, true) => ("_", "_"),
            (false, false) => ("", ""),
        };
        builder.push_literal(prefix);
        builder.push_escaped_field(element_id, field_id, &span.text, field_utf16_offset);
        builder.push_literal(suffix);
        field_utf16_offset += span.text.chars().map(char::len_utf16).sum::<usize>();
    }
}
