use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use crate::ast::{
    AssetEntry, DocumentAST, DocumentElement, DocumentSection, ReferenceEntry, RichText,
};
use crate::document_session::{
    DOCUMENT_STATE_PATH, FIELD_SOURCE_MAP_PATH, LIB_PATH, MAIN_PATH, PROJECT_SETTINGS_PATH,
    REFERENCES_PATH, SOURCE_MAP_PATH, TEMPLATE_PATH,
};
use crate::document_session_types::{
    FieldSourceMapEntry, GeneratedFragment, ProjectSourceLayout, SectionSource, SourceMapEntry,
};
use crate::document_source_builder::SourceBuilder;
use crate::template_spec::{ParamSpec, ParamType, SectionKind, TemplateSpec};

pub(crate) struct GeneratedProjectSources {
    pub(crate) main_source: String,
    pub(crate) lib_source: String,
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
        lib_path: LIB_PATH.to_string(),
        section_paths,
        references_path: REFERENCES_PATH.to_string(),
        source_map_path: SOURCE_MAP_PATH.to_string(),
        field_source_map_path: FIELD_SOURCE_MAP_PATH.to_string(),
        document_state_path: DOCUMENT_STATE_PATH.to_string(),
        project_settings_path: PROJECT_SETTINGS_PATH.to_string(),
        template_path: TEMPLATE_PATH.to_string(),
    }
}

pub(crate) fn generate_project_sources(
    ast: &DocumentAST,
    template: &TemplateSpec,
) -> GeneratedProjectSources {
    let mut sections = Vec::new();
    let mut fragments = HashMap::new();
    let mut source_map = Vec::new();
    let mut field_source_map = Vec::new();

    for section in &ast.sections {
        match section {
            DocumentSection::Content(content) => {
                let section_id = content.id.clone();
                let file_path = section_path(&section_id);
                let mut source = String::new();
                let mut fragment_ids = Vec::new();
                let mut char_offset = 0;

                for element in &content.elements {
                    let start_byte = source.len();
                    let start_char = char_offset;
                    let fragment = element_fragment(
                        element,
                        &content.id,
                        &file_path,
                        start_byte,
                        start_char,
                        template,
                        &ast.assets,
                    );
                    if !fragment.source.is_empty() {
                        source.push_str(&fragment.source);
                        char_offset += fragment.source.chars().count();
                        source_map.extend(fragment.source_map_ranges.clone());
                        field_source_map.extend(fragment.field_source_map_ranges.clone());
                    }
                    fragment_ids.push(fragment.element_id.clone());
                    fragments.insert(fragment.element_id.clone(), fragment);
                }

                sections.push(SectionSource {
                    section_id,
                    file_path,
                    source,
                    fragment_ids,
                    revision: 0,
                });
            }
        }
    }

    let section_paths = sections
        .iter()
        .map(|section| section.file_path.clone())
        .collect::<Vec<_>>();
    let layout = default_layout(section_paths);

    // Generate lib.typ source using SourceBuilder
    let lib_builder = generate_lib_typst(ast, template);
    let lib_source = lib_builder.source.clone();

    let cover_id = "inputs".to_string();

    // Map fields from lib.typ to "lib.typ"
    let lib_field_ranges = lib_builder.into_absolute_field_ranges(&cover_id, LIB_PATH, 0);
    field_source_map.extend(lib_field_ranges);

    // Generate main source using SourceBuilder to track cover page fields
    let mut main_builder = SourceBuilder::default();

    // Import lib.typ and apply show rule wrapper
    main_builder.push_literal("#import \"lib.typ\": *\n");
    main_builder.push_literal("#show: apply\n");

    // Set document title and keywords metadata
    main_builder.push_literal("#set document(title: [");
    main_builder.push_escaped_field("inputs", "/title", &ast.metadata.title, 0);
    main_builder.push_literal("]");
    if !ast.metadata.keywords.is_empty() {
        let escaped_keywords: Vec<String> = ast
            .metadata
            .keywords
            .iter()
            .map(|k| format!("\"{}\"", escape_typst_string(k)))
            .collect();
        let tuple_suffix = if escaped_keywords.len() == 1 { "," } else { "" };
        main_builder.push_literal(&format!(
            ", keywords: ({}{tuple_suffix})",
            escaped_keywords.join(", ")
        ));
    }
    main_builder.push_literal(")\n\n");

    // Generate sections according to template specification
    for section_spec in &template.sections {
        match section_spec.kind {
            SectionKind::FunctionCall => {
                if let Some(func_name) = &section_spec.function {
                    if section_spec.pagebreak_before {
                        main_builder.push_literal("#pagebreak()\n");
                    }
                    main_builder.push_literal(&format!("#{}", func_name));
                    main_builder.push_literal("(\n");

                    let mut positional_pushed = false;
                    let mut named_pushed = false;

                    // Positionals first
                    for param in &section_spec.params {
                        if param.key == "_positional" {
                            main_builder.push_literal("  ");
                            let pushed =
                                resolve_param_builder(param, ast, &cover_id, &mut main_builder);
                            if !pushed {
                                if let Some(default_val) = &param.default {
                                    if let Some(formatted) =
                                        format_json_val(default_val, &param.param_type)
                                    {
                                        main_builder.push_literal(&formatted);
                                    }
                                }
                            }
                            positional_pushed = true;
                        }
                    }

                    // Named parameters next
                    for param in &section_spec.params {
                        if param.key != "_positional" {
                            let mut temp_builder = SourceBuilder::default();
                            let pushed =
                                resolve_param_builder(param, ast, &cover_id, &mut temp_builder);
                            if pushed {
                                if positional_pushed || named_pushed {
                                    main_builder.push_literal(",\n");
                                }
                                main_builder.push_literal(&format!("  {}: ", param.key));
                                main_builder.push_builder(temp_builder);
                                named_pushed = true;
                            } else if let Some(default_val) = &param.default {
                                if let Some(formatted) =
                                    format_json_val(default_val, &param.param_type)
                                {
                                    if positional_pushed || named_pushed {
                                        main_builder.push_literal(",\n");
                                    }
                                    main_builder
                                        .push_literal(&format!("  {}: {}", param.key, formatted));
                                    named_pushed = true;
                                }
                            }
                        }
                    }

                    main_builder.push_literal("\n)\n\n");
                }
            }
            SectionKind::Literal => {
                if let Some(lit) = &section_spec.source {
                    if section_spec.pagebreak_before {
                        main_builder.push_literal("#pagebreak()\n");
                    }
                    main_builder.push_literal(lit);
                    main_builder.push_literal("\n\n");
                }
            }
            SectionKind::Content => {
                for section in &sections {
                    main_builder.push_literal(&format!("#include \"{}\"\n\n", section.file_path));
                }
            }
            SectionKind::Bibliography => {
                if !ast.references.is_empty() {
                    if section_spec.pagebreak_before {
                        main_builder.push_literal("#pagebreak()\n");
                    }
                    let file = section_spec.file.as_deref().unwrap_or("references.bib");
                    if let Some(title) = &section_spec.title {
                        main_builder.push_literal(&format!(
                            "#bibliography(\"{}\", title: [{}])\n\n",
                            file, title
                        ));
                    } else {
                        main_builder.push_literal(&format!("#bibliography(\"{}\")\n\n", file));
                    }
                }
            }
            SectionKind::Appendix => {
                if let Some(show_rule) = &section_spec.show_rule {
                    main_builder.push_literal(&format!("#show: {}\n\n", show_rule));
                }
                for section in &sections {
                    main_builder.push_literal(&format!("#include \"{}\"\n\n", section.file_path));
                }
            }
        }
    }

    let main_source = main_builder.source.clone();

    // Map cover fields directly to main.typ
    let cover_field_ranges = main_builder.into_absolute_field_ranges(&cover_id, MAIN_PATH, 0);
    field_source_map.extend(cover_field_ranges);

    let cover_label = label_for_id(&cover_id);
    let cover_map_entry = SourceMapEntry {
        element_id: cover_id.clone(),
        section_id: cover_id.clone(),
        file_path: MAIN_PATH.to_string(),
        start: 0,
        end: main_source.chars().count(),
        byte_start: 0,
        byte_end: main_source.len(),
        label: cover_label,
        page: None,
    };
    source_map.push(cover_map_entry.clone());

    fragments.insert(
        cover_id.clone(),
        GeneratedFragment {
            element_id: cover_id.clone(),
            section_id: cover_id.clone(),
            kind: "Inputs".to_string(),
            source_hash: hash_source(&format!("{}{}", main_source, lib_source)),
            source: main_source.clone(),
            dependencies: Vec::new(),
            source_map_ranges: vec![cover_map_entry],
            field_source_map_ranges: Vec::new(),
        },
    );

    let references_source = generate_references_bib(&ast.references);

    GeneratedProjectSources {
        main_source,
        lib_source,
        references_source,
        sections,
        fragments,
        source_map,
        field_source_map,
        layout,
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
        DocumentElement::Custom(custom) => custom.id.clone(),
    }
}

fn element_kind(element: &DocumentElement) -> &'static str {
    match element {
        DocumentElement::Heading(_) => "Heading",
        DocumentElement::Paragraph(_) => "Paragraph",
        DocumentElement::Table(_) => "Table",
        DocumentElement::Equation(_) => "Equation",
        DocumentElement::Figure(_) => "Figure",
        DocumentElement::Custom(_) => "Custom",
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

fn equation_source_field_id(element_id: &str) -> String {
    format!("{element_id}:latexSource")
}

fn table_cell_field_id(element_id: &str, row_index: usize, col_index: usize) -> String {
    format!("{element_id}:cell:{row_index}:{col_index}")
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

pub(crate) fn generate_lib_typst(
    ast: &DocumentAST,
    template: &TemplateSpec,
) -> SourceBuilder {
    let mut builder = SourceBuilder::default();

    // Package imports (placed at the top level of lib.typ)
    builder.push_literal(&template.package.to_typst_import_line());
    builder.push_literal("\n");
    for dep in &template.package.dependencies {
        builder.push_literal(&dep.to_typst_import_line());
        builder.push_literal("\n");
    }
    builder.push_literal("\n");

    // Define apply function (which wraps the content in a content block to propagate set/show rules)
    builder.push_literal("#let apply(body) = [\n");

    // Show rule
    if let Some(show_rule) = &template.show_rule {
        builder.push_literal(&format!("  #show: {}.with(\n", show_rule.function));
        let mut pushed_any = false;
        let cover_id = "inputs";
        for param in &show_rule.params {
            let mut val_builder = SourceBuilder::default();
            let pushed = resolve_param_builder(param, ast, cover_id, &mut val_builder);
            if pushed {
                if pushed_any {
                    builder.push_literal(",\n");
                }
                builder.push_literal(&format!("    {}: ", param.key));
                builder.push_builder(val_builder);
                pushed_any = true;
            } else if let Some(default_val) = &param.default {
                if let Some(formatted) = format_json_val(default_val, &param.param_type) {
                    if pushed_any {
                        builder.push_literal(",\n");
                    }
                    builder.push_literal(&format!("    {}: {}", param.key, formatted));
                    pushed_any = true;
                }
            }
        }
        builder.push_literal("\n  )\n\n");
    }

    // Set rules immediately after show rule
    let settings = &ast.metadata.project_settings;
    if let Some(font) = &settings.text_font {
        let size_str = settings
            .font_size
            .map(|s| format!(", size: {}pt", s))
            .unwrap_or_default();
        builder.push_literal(&format!(
            "  #set text(font: \"{}\"{})\n",
            escape_typst_string(font),
            size_str
        ));
    } else if let Some(size) = settings.font_size {
        builder.push_literal(&format!("  #set text(size: {}pt)\n", size));
    }
    if let Some(lang) = &settings.language {
        builder.push_literal(&format!(
            "  #set text(lang: \"{}\")\n",
            escape_typst_string(lang)
        ));
    }

    builder.push_literal("  #body\n");
    builder.push_literal("]\n");

    builder
}


fn resolve_param_builder(
    param: &ParamSpec,
    ast: &DocumentAST,
    _section_id: &str,
    builder: &mut SourceBuilder,
) -> bool {
    let source = match &param.source {
        Some(s) => s,
        None => return false,
    };
    let parts: Vec<&str> = source.split('.').collect();
    if parts.len() < 2 {
        return false;
    }

    match parts[0] {
        "settings" => {
            let settings = &ast.metadata.project_settings;
            match parts[1] {
                "font_size" => {
                    if let Some(f) = settings.font_size {
                        builder.push_literal(&format!("{}pt", f));
                        true
                    } else {
                        false
                    }
                }
                "paper_size" => {
                    if let Some(s) = &settings.paper_size {
                        builder.push_literal(&format!("\"{}\"", escape_typst_string(s)));
                        true
                    } else {
                        false
                    }
                }
                "language" => {
                    if let Some(s) = &settings.language {
                        builder.push_literal(&format!("\"{}\"", escape_typst_string(s)));
                        true
                    } else {
                        false
                    }
                }
                "text_font" => {
                    if let Some(s) = &settings.text_font {
                        builder.push_literal(&format!("\"{}\"", escape_typst_string(s)));
                        true
                    } else {
                        false
                    }
                }
                "math_font" => {
                    if let Some(s) = &settings.math_font {
                        builder.push_literal(&format!("\"{}\"", escape_typst_string(s)));
                        true
                    } else {
                        false
                    }
                }
                "raw_font" => {
                    if let Some(s) = &settings.raw_font {
                        builder.push_literal(&format!("\"{}\"", escape_typst_string(s)));
                        true
                    } else {
                        false
                    }
                }
                "table_stroke_width" => {
                    if let Some(f) = settings.table_stroke_width {
                        builder.push_literal(&format!("{}pt", f));
                        true
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        "inputs" | "cover_page" | "metadata" => {
            let key = parts[1];
            let val = match ast.inputs.get(key) {
                Some(v) => v,
                None => return false,
            };

            match &param.param_type {
                ParamType::Content => {
                    if let Some(s) = val.as_str() {
                        let trimmed = s.trim();
                        if trimmed.is_empty() {
                            if param.key != "_positional" {
                                return false;
                            }
                            builder.push_literal("[]");
                        } else {
                            builder.push_literal("[");
                            builder.push_escaped_field("inputs", &format!("/{}", key), trimmed, 0);
                            builder.push_literal("]");
                        }
                        true
                    } else {
                        false
                    }
                }
                ParamType::String => {
                    if let Some(s) = val.as_str() {
                        builder.push_literal("\"");
                        builder.push_escaped_field("inputs", &format!("/{}", key), s, 0);
                        builder.push_literal("\"");
                        true
                    } else {
                        false
                    }
                }
                ParamType::Length => {
                    if let Some(s) = val.as_str() {
                        builder.push_literal(s);
                        true
                    } else if let Some(n) = val.as_f64() {
                        builder.push_literal(&format!("{}pt", n));
                        true
                    } else {
                        false
                    }
                }
                ParamType::Boolean => {
                    if let Some(b) = val.as_bool() {
                        builder.push_literal(&b.to_string());
                        true
                    } else {
                        false
                    }
                }
                ParamType::Integer => {
                    if let Some(i) = val.as_i64() {
                        builder.push_literal(&i.to_string());
                        true
                    } else {
                        false
                    }
                }
                ParamType::Float => {
                    if let Some(f) = val.as_f64() {
                        builder.push_literal(&f.to_string());
                        true
                    } else {
                        false
                    }
                }
                ParamType::StringArray => {
                    if let Some(arr) = val.as_array() {
                        if arr.is_empty() {
                            builder.push_literal("()");
                            return true;
                        }
                        builder.push_literal("(");
                        let mut first = true;
                        let mut item_count = 0;
                        for (idx, item) in arr.iter().enumerate() {
                            if let Some(s) = item.as_str() {
                                if !first {
                                    builder.push_literal(", ");
                                }
                                first = false;
                                item_count += 1;
                                builder.push_literal("\"");
                                builder.push_escaped_field(
                                    "inputs",
                                    &format!("/{}/{}", key, idx),
                                    s,
                                    0,
                                );
                                builder.push_literal("\"");
                            }
                        }
                        if item_count == 1 {
                            builder.push_literal(",");
                        }
                        builder.push_literal(")");
                        true
                    } else {
                        false
                    }
                }
                ParamType::AuthorList => {
                    if let Some(arr) = val.as_array() {
                        if arr.is_empty() {
                            return false;
                        }
                        builder.push_literal("(");
                        let mut first = true;
                        let mut author_count = 0;
                        for (idx, item) in arr.iter().enumerate() {
                            if let Some(obj) = item.as_object() {
                                if !first {
                                    builder.push_literal(", ");
                                }
                                first = false;
                                author_count += 1;
                                builder.push_literal("(");
                                let mut has_field = false;
                                if let Some(name) = obj.get("name").and_then(|v| v.as_str()) {
                                    builder.push_literal("name: [");
                                    builder.push_escaped_field(
                                        "inputs",
                                        &format!("/authors/{}/name", idx),
                                        name,
                                        0,
                                    );
                                    builder.push_literal("]");
                                    has_field = true;
                                }
                                if let Some(email) = obj.get("email").and_then(|v| v.as_str()) {
                                    if !email.trim().is_empty() {
                                        if has_field {
                                            builder.push_literal(", ");
                                        }
                                        builder.push_literal("email: \"");
                                        builder.push_escaped_field(
                                            "inputs",
                                            &format!("/authors/{}/email", idx),
                                            email,
                                            0,
                                        );
                                        builder.push_literal("\"");
                                        has_field = true;
                                    }
                                }
                                if let Some(affs) =
                                    obj.get("affiliations").and_then(|v| v.as_array())
                                {
                                    let aff_refs = affs
                                        .iter()
                                        .enumerate()
                                        .filter_map(|(aff_idx, value)| {
                                            value
                                                .as_str()
                                                .filter(|s| !s.trim().is_empty())
                                                .map(|s| (aff_idx, s))
                                        })
                                        .collect::<Vec<_>>();
                                    if !aff_refs.is_empty() {
                                        if has_field {
                                            builder.push_literal(", ");
                                        }
                                        builder.push_literal("affiliations: (");
                                        for (aff_position, (aff_idx, aff_ref)) in
                                            aff_refs.iter().enumerate()
                                        {
                                            if aff_position > 0 {
                                                builder.push_literal(", ");
                                            }
                                            builder.push_literal("\"");
                                            builder.push_escaped_field(
                                                "inputs",
                                                &format!(
                                                    "/authors/{}/affiliations/{}",
                                                    idx, aff_idx
                                                ),
                                                aff_ref,
                                                0,
                                            );
                                            builder.push_literal("\"");
                                        }
                                        if aff_refs.len() == 1 {
                                            builder.push_literal(",");
                                        }
                                        builder.push_literal(")");
                                    }
                                }
                                builder.push_literal(")");
                            }
                        }
                        if author_count == 1 {
                            builder.push_literal(",");
                        }
                        builder.push_literal(")");
                        true
                    } else {
                        false
                    }
                }
                ParamType::AffiliationMap => {
                    if let Some(arr) = val.as_array() {
                        let has_any = arr
                            .iter()
                            .any(|v| v.as_str().map(|s| !s.trim().is_empty()).unwrap_or(false));
                        if !has_any {
                            builder.push_literal("(:)");
                            return true;
                        }
                        builder.push_literal("(");
                        let mut first = true;
                        for (idx, item) in arr.iter().enumerate() {
                            if let Some(aff_name) = item.as_str() {
                                if aff_name.trim().is_empty() {
                                    continue;
                                }
                                if !first {
                                    builder.push_literal(", ");
                                }
                                first = false;
                                builder.push_literal(&format!("\"{}\": [", idx + 1));
                                builder.push_escaped_field(
                                    "inputs",
                                    &format!("/affiliations/{}", idx),
                                    aff_name,
                                    0,
                                );
                                builder.push_literal("]");
                            }
                        }
                        if first {
                            builder.push_literal(":");
                        }
                        builder.push_literal(")");
                        true
                    } else {
                        false
                    }
                }
                _ => false,
            }
        }
        _ => false,
    }
}

fn format_json_val(val: &serde_json::Value, param_type: &ParamType) -> Option<String> {
    match (param_type, val) {
        (ParamType::Length, serde_json::Value::String(s)) => Some(s.clone()),
        (ParamType::String, serde_json::Value::String(s)) => {
            Some(format!("\"{}\"", escape_typst_string(s)))
        }
        (ParamType::Boolean, serde_json::Value::Bool(b)) => Some(b.to_string()),
        (ParamType::Integer, serde_json::Value::Number(n)) => Some(n.to_string()),
        (ParamType::Float, serde_json::Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
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

fn element_fragment(
    element: &DocumentElement,
    section_id: &str,
    file_path: &str,
    section_byte_start: usize,
    section_char_start: usize,
    template: &TemplateSpec,
    assets: &[AssetEntry],
) -> GeneratedFragment {
    let element_id = element_id(element);
    let kind = element_kind(element);
    let label = label_for_id(&element_id);
    let builder = generate_element_typst(element, &label, template, assets);
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

fn generate_element_typst(
    element: &DocumentElement,
    label: &str,
    template: &TemplateSpec,
    assets: &[AssetEntry],
) -> SourceBuilder {
    let mut builder = SourceBuilder::default();
    match element {
        DocumentElement::Heading(heading) => {
            let level = heading.level.clamp(1, 5) as usize;
            let element_id = &heading.id;
            let field_id = rich_text_field_id(element_id);
            builder.push_literal(&format!("#heading(level: {}, [", level));

            let mut title = SourceBuilder::default();
            push_rich_text_field(&mut title, element_id, &field_id, &heading.content);
            if title.source.trim().is_empty() {
                builder.push_generated_field_marker(element_id, &field_id, "Untitled heading", 0);
            } else {
                builder.push_builder(title);
            }
            builder.push_literal(&format!("]) <{label}>\n\n"));
        }
        DocumentElement::Paragraph(paragraph) => {
            let element_id = &paragraph.id;
            let field_id = rich_text_field_id(element_id);
            let mut par_builder = SourceBuilder::default();
            push_rich_text_field(&mut par_builder, element_id, &field_id, &paragraph.content);
            if par_builder.source.trim().is_empty() {
                builder.clear();
            } else {
                builder.push_literal("#par([");
                builder.push_builder(par_builder);
                builder.push_literal(&format!("]) <{label}>\n\n"));
            }
        }
        DocumentElement::Equation(equation) => {
            let source = normalize_math_source(&equation.latex_source);
            if !source.is_empty() {
                let field_id = equation_source_field_id(&equation.id);
                builder.push_literal(&format!("#math.equation(block: {}, $", equation.is_block));
                builder.push_raw_field(&equation.id, &field_id, &source, 0);
                builder.push_literal(&format!("$) <{label}>\n\n"));
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
                .and_then(|asset_id| {
                    assets
                        .iter()
                        .find(|asset| asset.id == *asset_id)
                        .map(|asset| asset.path.clone())
                        .or_else(|| Some(format!("assets/{}", path_id_for_id(asset_id))))
                });

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
        DocumentElement::Custom(custom) => {
            if let Some(spec) = template
                .custom_elements
                .iter()
                .find(|ce| ce.kind == custom.element_type)
            {
                builder.push_literal(&format!("#{}", spec.function));
                builder.push_literal("(\n");
                let mut first = true;
                for field_spec in &spec.fields {
                    let field_val =
                        custom
                            .fields
                            .get(&field_spec.key)
                            .cloned()
                            .unwrap_or_else(|| {
                                field_spec
                                    .default
                                    .clone()
                                    .unwrap_or(serde_json::Value::Null)
                            });

                    if field_spec.key == "_positional" {
                        if !first {
                            builder.push_literal(",\n");
                        }
                        first = false;
                        builder.push_literal("  ");
                        format_json_val_for_custom_field(
                            &custom.id,
                            &field_spec.key,
                            &field_val,
                            &field_spec.param_type,
                            &mut builder,
                        );
                    } else {
                        if !first {
                            builder.push_literal(",\n");
                        }
                        first = false;
                        builder.push_literal(&format!("  {}: ", field_spec.key));
                        format_json_val_for_custom_field(
                            &custom.id,
                            &field_spec.key,
                            &field_val,
                            &field_spec.param_type,
                            &mut builder,
                        );
                    }
                }
                builder.push_literal(&format!("\n) <{label}>\n\n"));
            } else {
                builder.push_literal(&format!(
                    "/* unknown custom element: {} */\n\n",
                    custom.element_type
                ));
            }
        }
    };
    builder
}

fn format_json_val_for_custom_field(
    element_id: &str,
    key: &str,
    val: &serde_json::Value,
    param_type: &ParamType,
    builder: &mut SourceBuilder,
) {
    let field_id = format!("{}:field:{}", element_id, key);
    match (param_type, val) {
        (ParamType::Content, serde_json::Value::String(s)) => {
            builder.push_literal("[");
            builder.push_escaped_field(element_id, &field_id, s, 0);
            builder.push_literal("]");
        }
        (ParamType::String, serde_json::Value::String(s)) => {
            builder.push_literal("\"");
            builder.push_escaped_field(element_id, &field_id, s, 0);
            builder.push_literal("\"");
        }
        (ParamType::Boolean, serde_json::Value::Bool(b)) => {
            builder.push_literal(&b.to_string());
        }
        (ParamType::Integer, serde_json::Value::Number(n)) => {
            builder.push_literal(&n.to_string());
        }
        (ParamType::Float, serde_json::Value::Number(n)) => {
            builder.push_literal(&n.to_string());
        }
        (ParamType::Length, serde_json::Value::String(s)) => {
            builder.push_literal(s);
        }
        (ParamType::StringArray, serde_json::Value::Array(arr)) => {
            builder.push_literal("(");
            let mut first = true;
            let mut item_count = 0;
            for (idx, item) in arr.iter().enumerate() {
                if let Some(s) = item.as_str() {
                    if !first {
                        builder.push_literal(", ");
                    }
                    first = false;
                    item_count += 1;
                    builder.push_literal("\"");
                    builder.push_escaped_field(element_id, &format!("{}:{}", field_id, idx), s, 0);
                    builder.push_literal("\"");
                }
            }
            if item_count == 1 {
                builder.push_literal(",");
            }
            builder.push_literal(")");
        }
        _ => {
            builder.push_literal("none");
        }
    }
}

fn figure_body_field_id(element_id: &str) -> String {
    format!("{element_id}:body")
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
