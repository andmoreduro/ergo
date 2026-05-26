use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use crate::ast::{
    AssetEntry, DocumentAST, DocumentElement, DocumentSection, ReferenceEntry, RichText,
};
use crate::document_generation_lib::{
    escape_typst_string, format_json_val, format_typst_length, format_typst_length_number,
    generate_lib_typst, is_sized_unit, push_package_imports, push_wrapper_symbol_import,
    resolve_param_builder,
};
use crate::required_input_fallback::RequiredInputFallbacks;
use crate::document_session::{
    DOCUMENT_STATE_PATH, FIELD_SOURCE_MAP_PATH, LIB_PATH, MAIN_PATH, PROJECT_SETTINGS_PATH,
    REFERENCES_PATH, SOURCE_MAP_PATH, TEMPLATE_PATH,
};
use crate::document_session_types::{
    FieldSourceMapEntry, GeneratedFragment, ProjectSourceLayout, SourceMapEntry,
};
use crate::document_source_builder::SourceBuilder;
use crate::template_spec::{ElementOverrideSpec, ParamType, SectionKind, TemplateSpec};

pub(crate) struct GeneratedProjectSources {
    pub(crate) main_source: String,
    pub(crate) lib_source: String,
    pub(crate) references_source: String,
    pub(crate) fragments: HashMap<String, GeneratedFragment>,
    pub(crate) source_map: Vec<SourceMapEntry>,
    pub(crate) field_source_map: Vec<FieldSourceMapEntry>,
    pub(crate) layout: ProjectSourceLayout,
    pub(crate) element_content_hashes: HashMap<String, u64>,
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

pub(crate) fn generate_project_sources_incremental(
    ast: &DocumentAST,
    template: &TemplateSpec,
    cached_fragments: &HashMap<String, GeneratedFragment>,
    cached_hashes: &HashMap<String, u64>,
) -> GeneratedProjectSources {
    generate_project_sources_inner(ast, template, Some(cached_fragments), Some(cached_hashes))
}

fn element_content_hash(element: &DocumentElement) -> u64 {
    let mut hasher = DefaultHasher::new();
    hash_document_element(element, &mut hasher);
    hasher.finish()
}

fn hash_document_element(element: &DocumentElement, hasher: &mut impl Hasher) {
    std::mem::discriminant(element).hash(hasher);
    match element {
        DocumentElement::Heading(h) => {
            h.id.hash(hasher);
            h.level.hash(hasher);
            hash_rich_text_slice(&h.content, hasher);
        }
        DocumentElement::Paragraph(p) => {
            p.id.hash(hasher);
            hash_rich_text_slice(&p.content, hasher);
        }
        DocumentElement::Equation(e) => {
            e.id.hash(hasher);
            e.latex_source.hash(hasher);
            e.is_block.hash(hasher);
        }
        DocumentElement::Table(t) => {
            t.id.hash(hasher);
            t.rows.hash(hasher);
            t.cols.hash(hasher);
            t.cells.len().hash(hasher);
            for row in &t.cells {
                row.len().hash(hasher);
                for cell in row {
                    cell.content.hash(hasher);
                    cell.row_span.hash(hasher);
                    cell.col_span.hash(hasher);
                }
            }
            t.column_sizes.hash(hasher);
            hash_json_map(&t.extra_fields, hasher);
        }
        DocumentElement::Figure(f) => {
            f.id.hash(hasher);
            f.asset_id.hash(hasher);
            hash_document_element(&f.content, hasher);
            f.caption.hash(hasher);
            f.placement.hash(hasher);
            hash_json_map(&f.extra_fields, hasher);
        }
        DocumentElement::Custom(c) => {
            c.id.hash(hasher);
            c.element_type.hash(hasher);
            hash_json_map(&c.fields, hasher);
        }
    }
}

fn hash_rich_text_slice(content: &[RichText], hasher: &mut impl Hasher) {
    content.len().hash(hasher);
    for rt in content {
        rt.text.hash(hasher);
        rt.bold.hash(hasher);
        rt.italic.hash(hasher);
        rt.kind.hash(hasher);
        rt.reference_id.hash(hasher);
        rt.equation_source.hash(hasher);
    }
}

fn hash_json_map(
    map: &std::collections::HashMap<String, serde_json::Value>,
    hasher: &mut impl Hasher,
) {
    map.len().hash(hasher);
    let mut keys: Vec<&String> = map.keys().collect();
    keys.sort();
    for key in keys {
        key.hash(hasher);
        hash_json_value(&map[key], hasher);
    }
}

fn hash_json_value(value: &serde_json::Value, hasher: &mut impl Hasher) {
    std::mem::discriminant(value).hash(hasher);
    match value {
        serde_json::Value::Null => {}
        serde_json::Value::Bool(b) => b.hash(hasher),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                0u8.hash(hasher);
                i.hash(hasher);
            } else if let Some(u) = n.as_u64() {
                1u8.hash(hasher);
                u.hash(hasher);
            } else if let Some(f) = n.as_f64() {
                2u8.hash(hasher);
                f.to_bits().hash(hasher);
            }
        }
        serde_json::Value::String(s) => s.hash(hasher),
        serde_json::Value::Array(arr) => {
            arr.len().hash(hasher);
            for item in arr {
                hash_json_value(item, hasher);
            }
        }
        serde_json::Value::Object(map) => {
            map.len().hash(hasher);
            for (k, v) in map {
                k.hash(hasher);
                hash_json_value(v, hasher);
            }
        }
    }
}

fn generate_project_sources_inner(
    ast: &DocumentAST,
    template: &TemplateSpec,
    cached_fragments: Option<&HashMap<String, GeneratedFragment>>,
    cached_hashes: Option<&HashMap<String, u64>>,
) -> GeneratedProjectSources {
    let mut fragments = HashMap::new();
    let mut source_map = Vec::new();
    let mut field_source_map = Vec::new();
    let mut element_paths = Vec::new();
    let mut element_content_hashes = HashMap::new();

    for section in &ast.sections {
        match section {
            DocumentSection::Content(content) => {
                for element in &content.elements {
                    let element_id = element_id(element);
                    let file_path = element_path(&element_id);
                    let content_hash = element_content_hash(element);
                    element_content_hashes.insert(element_id.clone(), content_hash);

                    let fragment = match (cached_fragments, cached_hashes) {
                        (Some(cached_fragments), Some(cached_hashes))
                            if cached_hashes.get(&element_id) == Some(&content_hash) =>
                        {
                            cached_fragments
                                .get(&element_id)
                                .cloned()
                                .unwrap_or_else(|| {
                                    element_fragment(
                                        element,
                                        &content.id,
                                        &file_path,
                                        0,
                                        0,
                                        template,
                                        &ast.assets,
                                        &ast.references,
                                    )
                                })
                        }
                        _ => element_fragment(
                            element,
                            &content.id,
                            &file_path,
                            0,
                            0,
                            template,
                            &ast.assets,
                            &ast.references,
                        ),
                    };

                    if !fragment.source.is_empty() {
                        element_paths.push(file_path.clone());
                        source_map.extend(fragment.source_map_ranges.clone());
                        field_source_map.extend(fragment.field_source_map_ranges.clone());
                    }
                    fragments.insert(fragment.element_id.clone(), fragment);
                }
            }
        }
    }

    let layout = default_layout(element_paths.clone());

    // Generate lib.typ source using SourceBuilder
    let lib_builder = generate_lib_typst(ast, template);
    let lib_source = lib_builder.source.clone();

    let cover_id = "inputs".to_string();
    let fallbacks = RequiredInputFallbacks::from_ast(template, ast);

    // Map fields from lib.typ to "lib.typ"
    let lib_field_ranges = lib_builder.into_absolute_field_ranges(&cover_id, LIB_PATH, 0);
    field_source_map.extend(lib_field_ranges);

    // Generate main source using SourceBuilder to track cover page fields
    let mut main_builder = SourceBuilder::default();

    // Element fragments are #include'd from main.typ; they need template package
    // symbols (e.g. apa-figure) in this file's scope — importing lib.typ with * only
    // brings lib-defined bindings such as apply, not the package imports in lib.typ.
    push_package_imports(template, &mut main_builder);
    main_builder.push_literal("#import \"lib.typ\": *\n");
    main_builder.push_literal("#show: apply\n");

    // Set document title and keywords metadata
    main_builder.push_literal("#set document(title: [");
    let document_title = fallbacks.effective_title(&ast.metadata.title);
    main_builder.push_escaped_field("inputs", "/title", &document_title, 0);
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
                            let pushed = resolve_param_builder(
                                param,
                                ast,
                                &fallbacks,
                                &cover_id,
                                &mut main_builder,
                            );
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
                            let pushed = resolve_param_builder(
                                param,
                                ast,
                                &fallbacks,
                                &cover_id,
                                &mut temp_builder,
                            );
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
                for path in &element_paths {
                    main_builder.push_literal(&format!("#include \"{}\"\n\n", path));
                }
            }
            SectionKind::Bibliography => {
                if !ast.references.is_empty() {
                    if section_spec.pagebreak_before {
                        main_builder.push_literal("#pagebreak()\n");
                    }
                    let file = section_spec.file.as_deref().unwrap_or("references.bib");
                    main_builder
                        .push_literal(&format!("#bibliography(\"{}\", full: true)\n\n", file));
                }
            }
            SectionKind::Appendix => {
                if let Some(show_rule) = &section_spec.show_rule {
                    main_builder.push_literal(&format!("#show: {}\n\n", show_rule));
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
        fragments,
        source_map,
        field_source_map,
        layout,
        element_content_hashes,
    }
}

fn element_path(element_id: &str) -> String {
    format!("elements/{}.typ", path_id_for_id(element_id))
}

/// Asset paths (e.g. `assets/photo.webp`) are root-relative in the VFS, but
/// Typst resolves `image("…")` relative to the file that contains the call.
/// Element files live under `elements/`, so prepend `../` to reach the root.
fn asset_path_relative_to_element(root_relative_path: &str) -> String {
    format!("../{root_relative_path}")
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

/// Typst function used to wrap table and image elements (defaults to `figure`).
fn element_figure_wrapper_name(over: Option<&ElementOverrideSpec>) -> &str {
    if let Some(spec) = over {
        if let Some(wrapper) = spec.wrapper.as_deref() {
            if !wrapper.is_empty() {
                return wrapper;
            }
        }
        if let Some(function) = spec.function.as_deref() {
            if !function.is_empty() {
                return function;
            }
        }
    }
    "figure"
}

fn uses_standard_typst_figure(wrapper: &str) -> bool {
    wrapper == "figure"
}

/// Emit `#wrapper(...)` for template-specific wrappers such as `apa-figure`.
fn figure_image_typst_source(
    path: &str,
    extra_fields: &std::collections::HashMap<String, serde_json::Value>,
) -> String {
    let escaped = escape_typst_string(path);
    if let Some(serde_json::Value::String(width)) = extra_fields.get("width") {
        if let Some(length) = format_typst_length(width) {
            return format!("image(\"{escaped}\", width: {length})");
        }
    }
    format!("image(\"{escaped}\")")
}

/// The body (`#image`, `table(...)`, or rich text) is a direct argument — never wrapped
/// in Typst's built-in `#figure(...)`.
fn push_custom_wrapper_figure_element(
    builder: &mut SourceBuilder,
    template: &TemplateSpec,
    wrapper: &str,
    element_id: &str,
    override_spec: Option<&ElementOverrideSpec>,
    body: SourceBuilder,
    asset_path: Option<&str>,
    caption: &str,
    extra_fields: &std::collections::HashMap<String, serde_json::Value>,
    skip_extra_keys: &[&str],
) {
    push_wrapper_symbol_import(template, wrapper, builder);
    builder.push_literal(&format!("#{wrapper}(\n"));

    if let Some(path) = asset_path {
        let image_source = figure_image_typst_source(path, extra_fields);
        builder.push_literal("  ");
        builder.push_generated_field_marker(
            element_id,
            &figure_body_field_id(element_id),
            &image_source,
            0,
        );
        builder.push_literal("\n");
    } else if body.source.trim().is_empty() {
        builder.push_literal("  ");
        builder.push_generated_field_marker(
            element_id,
            &figure_body_field_id(element_id),
            "Figure content",
            0,
        );
        builder.push_literal("\n");
    } else {
        builder.push_literal("  ");
        builder.push_builder(body);
        builder.push_literal("\n");
    }

    if !caption.is_empty() {
        builder.push_literal(",\n  caption: [");
        builder.push_escaped_field(element_id, &figure_caption_field_id(element_id), caption, 0);
        builder.push_literal("]\n");
    }

    push_override_extra_fields(
        builder,
        element_id,
        override_spec,
        extra_fields,
        skip_extra_keys,
    );

    builder.push_literal(")\n");
}

fn extra_field_id(element_id: &str, key: &str) -> String {
    format!("{element_id}:extra:{key}")
}

fn extra_field_value_is_empty(val: &serde_json::Value) -> bool {
    match val {
        serde_json::Value::String(s) => s.trim().is_empty(),
        serde_json::Value::Null => true,
        _ => false,
    }
}

fn push_override_extra_fields(
    builder: &mut SourceBuilder,
    element_id: &str,
    override_spec: Option<&ElementOverrideSpec>,
    stored: &std::collections::HashMap<String, serde_json::Value>,
    skip_keys: &[&str],
) {
    let Some(over) = override_spec else {
        return;
    };

    for field_spec in &over.extra_fields {
        if skip_keys.contains(&field_spec.key.as_str()) {
            continue;
        }
        let Some(val) = stored.get(&field_spec.key) else {
            continue;
        };
        if extra_field_value_is_empty(val) {
            continue;
        }
        builder.push_literal(&format!(",\n  {}: ", field_spec.key));
        format_json_val_for_custom_field(
            element_id,
            &field_spec.key,
            val,
            &param_type_from_str(&field_spec.param_type),
            builder,
        );
    }
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

fn sanitize_table_column_size(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "auto" || is_sized_unit(trimmed) {
        trimmed.to_string()
    } else {
        "1fr".to_string()
    }
}

fn typst_placement_arg(value: &str) -> Option<&'static str> {
    match value.trim() {
        "top" => Some("top"),
        "bottom" => Some("bottom"),
        "auto" => Some("auto"),
        "here" | "" => None,
        _ => None,
    }
}

fn table_placement_value(table: &crate::ast::Table) -> &str {
    table
        .extra_fields
        .get("placement")
        .and_then(|value| value.as_str())
        .unwrap_or("here")
}

fn normalize_math_source(value: &str) -> String {
    value.trim().trim_matches('$').trim().to_string()
}

fn hash_source(source: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    hasher.finish()
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

fn bibliography_citation_keys(references: &[ReferenceEntry]) -> HashMap<String, String> {
    references
        .iter()
        .map(|reference| (reference.id.clone(), reference.citation_key.clone()))
        .collect()
}

fn typst_reference_marker(
    reference_id: &str,
    bibliography_keys: &HashMap<String, String>,
) -> String {
    if let Some(citation_key) = bibliography_keys.get(reference_id) {
        format!("@{citation_key}")
    } else {
        format!("@{}", label_for_id(reference_id))
    }
}

fn element_fragment(
    element: &DocumentElement,
    section_id: &str,
    file_path: &str,
    section_byte_start: usize,
    section_char_start: usize,
    template: &TemplateSpec,
    assets: &[AssetEntry],
    references: &[ReferenceEntry],
) -> GeneratedFragment {
    let element_id = element_id(element);
    let kind = element_kind(element);
    let label = label_for_id(&element_id);
    let bibliography_keys = bibliography_citation_keys(references);
    let builder = generate_element_typst(element, &label, template, assets, &bibliography_keys, true);
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

pub(crate) fn resource_preview_typst_for_element(
    element: &DocumentElement,
    template: &TemplateSpec,
    assets: &[AssetEntry],
    references: &[ReferenceEntry],
) -> Option<String> {
    let bibliography_keys = bibliography_citation_keys(references);
    let id = element_id(element);
    let label = label_for_id(&id);
    let builder = generate_element_typst(element, &label, template, assets, &bibliography_keys, false);
    let source = builder.source.trim();
    if source.is_empty() {
        None
    } else {
        Some(builder.source)
    }
}

fn generate_element_typst(
    element: &DocumentElement,
    label: &str,
    template: &TemplateSpec,
    assets: &[AssetEntry],
    bibliography_keys: &HashMap<String, String>,
    adjust_asset_paths: bool,
) -> SourceBuilder {
    let mut builder = SourceBuilder::default();
    match element {
        DocumentElement::Heading(heading) => {
            let level = heading.level.clamp(1, 6) as usize;
            let element_id = &heading.id;
            let field_id = rich_text_field_id(element_id);
            builder.push_literal(&format!("#heading(level: {}, [", level));

            let mut title = SourceBuilder::default();
            push_rich_text_field(
                &mut title,
                element_id,
                &field_id,
                &heading.content,
                bibliography_keys,
            );
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
            push_rich_text_field(
                &mut par_builder,
                element_id,
                &field_id,
                &paragraph.content,
                bibliography_keys,
            );
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

            let table_override = template
                .element_overrides
                .as_ref()
                .and_then(|o| o.table.as_ref());
            let wrapper = element_figure_wrapper_name(table_override);
            push_wrapper_symbol_import(template, wrapper, &mut builder);

            // Same `apa-figure` wrapper as figures: `table(...)` is a direct argument.
            builder.push_literal(&format!("#{wrapper}(\n  table(\n    columns: ({columns})"));

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

            builder.push_literal("\n  )");

            if let Some(placement) = typst_placement_arg(table_placement_value(table)) {
                builder.push_literal(&format!(",\n  placement: {placement}"));
            }

            push_override_extra_fields(
                &mut builder,
                &table.id,
                table_override,
                &table.extra_fields,
                &["placement"],
            );

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
                    bibliography_keys,
                );
            }
            let caption = figure.caption.trim();
            let placement = typst_placement_arg(&figure.placement);
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
                })
                .map(|p| if adjust_asset_paths { asset_path_relative_to_element(&p) } else { p });

            if body.source.trim().is_empty() && caption.is_empty() && asset_path.is_none() {
                return builder;
            }

            let figure_override = template
                .element_overrides
                .as_ref()
                .and_then(|o| o.figure.as_ref());
            let wrapper = element_figure_wrapper_name(figure_override);

            if uses_standard_typst_figure(wrapper) {
                builder.push_literal(&format!("#{wrapper}(\n  ["));

                if let Some(path) = asset_path {
                    let image_source =
                        figure_image_typst_source(&path, &figure.extra_fields);
                    builder.push_generated_field_marker(
                        &figure.id,
                        &figure_body_field_id(&figure.id),
                        &image_source,
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

                if let Some(placement) = placement {
                    builder.push_literal(&format!(",\n  placement: {placement}"));
                }
                push_override_extra_fields(
                    &mut builder,
                    &figure.id,
                    figure_override,
                    &figure.extra_fields,
                    &["caption", "width"],
                );
                builder.push_literal(&format!("\n) <{label}>\n\n"));
            } else {
                push_custom_wrapper_figure_element(
                    &mut builder,
                    template,
                    wrapper,
                    &figure.id,
                    figure_override,
                    body,
                    asset_path.as_deref(),
                    caption,
                    &figure.extra_fields,
                    &["caption", "width"],
                );
                builder.push_literal(&format!("<{label}>\n\n"));
            }
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
    let field_id = extra_field_id(element_id, key);
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
            if let Some(length) = format_typst_length(s) {
                builder.push_literal(&length);
            } else {
                builder.push_literal("none");
            }
        }
        (ParamType::Length, serde_json::Value::Number(n)) => {
            if let Some(length) = format_typst_length_number(n) {
                builder.push_literal(&length);
            } else {
                builder.push_literal("none");
            }
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
    bibliography_keys: &HashMap<String, String>,
) {
    let mut field_utf16_offset = 0;

    for span in content {
        if span.kind.as_deref() == Some("reference") {
            if let Some(reference_id) = span.reference_id.as_deref() {
                builder.push_generated_field_marker(
                    element_id,
                    field_id,
                    &typst_reference_marker(reference_id, bibliography_keys),
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

fn param_type_from_str(s: &str) -> ParamType {
    match s {
        "content" => ParamType::Content,
        "string" => ParamType::String,
        "length" => ParamType::Length,
        "boolean" => ParamType::Boolean,
        "integer" => ParamType::Integer,
        "float" => ParamType::Float,
        "string_array" => ParamType::StringArray,
        "content_array" => ParamType::ContentArray,
        "dictionary" => ParamType::Dictionary,
        "author_list" => ParamType::AuthorList,
        "affiliation_map" => ParamType::AffiliationMap,
        _ => ParamType::String,
    }
}

#[cfg(test)]
#[path = "document_session_generation_tests.rs"]
mod reference_marker_tests;
