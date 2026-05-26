use std::collections::HashMap;

use crate::ast::{DocumentAST, DocumentSection};
use crate::document_session::{
    DOCUMENT_STATE_PATH, FIELD_SOURCE_MAP_PATH, LIB_PATH, MAIN_PATH, PROJECT_SETTINGS_PATH,
    REFERENCES_PATH, SOURCE_MAP_PATH, TEMPLATE_PATH,
};
use crate::document_session_types::{
    FieldSourceMapEntry, GeneratedFragment, ProjectSourceLayout, SourceMapEntry,
};
use crate::document_source_builder::SourceBuilder;
use crate::required_input_fallback::RequiredInputFallbacks;
use crate::template_spec::{SectionKind, TemplateSpec};
use crate::typst_source::element_content_hash;
use crate::typst_source::{
    element_fragment, element_id, element_path, escape_typst_string, format_json_val,
    generate_lib_typst, generate_references_bib, hash_source, label_for_id, push_package_imports,
    resolve_param_builder,
};

#[cfg(test)]
use crate::typst_source::{
    bibliography_citation_keys, push_rich_text_field, typst_reference_marker,
};

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

#[cfg(test)]
#[path = "document_session_generation_tests.rs"]
mod reference_marker_tests;
