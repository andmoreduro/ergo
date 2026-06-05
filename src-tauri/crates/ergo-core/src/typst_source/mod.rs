use crate::ast::{DocumentAST, RichText};
use crate::document_source_builder::SourceBuilder;
use crate::required_input_fallback::RequiredInputFallbacks;
use crate::template_spec::{ParamSpec, ParamType, TemplateSpec};

mod custom_fields;
mod figures;
mod fragments;
mod hashing;
mod outline_titles;
mod paths;
mod quote_attribution;
mod references;
mod outlines;
mod rich_text;
mod tables;

pub(crate) use fragments::{element_fragment, resource_preview_typst_for_element};
pub(crate) use hashing::{element_content_hash, hash_source};
pub(crate) use paths::{element_id, element_path, label_for_id};
pub(crate) use outlines::{effective_bibliography_section_title, generate_front_matter_outlines};
pub(crate) use references::generate_references_bib;

#[cfg(test)]
pub(crate) use references::{bibliography_citation_keys, typst_reference_marker};

#[cfg(test)]
pub(crate) use rich_text::push_rich_text_field;

pub(crate) fn escape_typst_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

pub(crate) fn is_sized_unit(value: &str) -> bool {
    let units = ["fr", "pt", "mm", "cm", "in", "em", "rem", "px", "%"];
    units.iter().any(|unit| {
        value
            .strip_suffix(unit)
            .and_then(|number| number.parse::<f32>().ok())
            .is_some()
    })
}

pub(crate) fn format_typst_length(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed == "auto" || is_sized_unit(trimmed) {
        Some(trimmed.to_string())
    } else {
        None
    }
}

pub(crate) fn format_typst_length_number(value: &serde_json::Number) -> Option<String> {
    let number = value.as_f64()?;
    if number.is_finite() {
        Some(format!("{number}pt"))
    } else {
        None
    }
}

pub(crate) fn generate_lib_typst(ast: &DocumentAST, template: &TemplateSpec) -> SourceBuilder {
    let fallbacks = RequiredInputFallbacks::from_ast(template, ast);
    let mut builder = SourceBuilder::default();
    push_package_imports(template, &mut builder);
    builder.push_literal("#let apply(body) = [\n");
    push_document_show_rule(ast, template, &fallbacks, &mut builder);
    push_project_page_settings(ast, &mut builder);
    push_project_text_settings(ast, &mut builder);
    builder.push_literal("  #body\n");
    builder.push_literal("]\n");
    builder
}

pub(crate) fn push_package_imports(template: &TemplateSpec, builder: &mut SourceBuilder) {
    if !template.typst.package.name.is_empty() {
        builder.push_literal(&template.typst.package.to_typst_import_line());
        builder.push_literal("\n");
    }
    for dep in &template.typst.package.dependencies {
        builder.push_literal(&dep.to_typst_import_line());
        builder.push_literal("\n");
    }
    builder.push_literal("\n");
}

/// Per-element `.typ` fragments are `#include`d with file-local scope; import wrapper
/// symbols (e.g. `apa-figure`) in each fragment that uses a non-standard figure wrapper.
pub(crate) fn push_wrapper_symbol_import(
    template: &TemplateSpec,
    wrapper: &str,
    builder: &mut SourceBuilder,
) {
    if wrapper == "figure" {
        return;
    }
    builder.push_literal(&format!(
        "#import \"{}\": {}\n\n",
        template.typst.package.import_target(),
        wrapper
    ));
}

fn push_document_show_rule(
    ast: &DocumentAST,
    template: &TemplateSpec,
    fallbacks: &RequiredInputFallbacks<'_>,
    builder: &mut SourceBuilder,
) {
    let Some(show_rule) = &template.typst.show_rule else {
        return;
    };
    builder.push_literal(&format!("  #show: {}.with(\n", show_rule.function));
    let mut pushed_any = false;
    let cover_id = "inputs";
    for param in &show_rule.params {
        let mut val_builder = SourceBuilder::default();
        let pushed = resolve_param_builder(param, ast, fallbacks, cover_id, &mut val_builder);
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

fn push_project_page_settings(ast: &DocumentAST, builder: &mut SourceBuilder) {
    let Some(paper_size) = ast
        .metadata
        .project_settings
        .paper_size
        .as_deref()
        .map(str::trim)
        .filter(|paper_size| !paper_size.is_empty())
    else {
        return;
    };

    builder.push_literal(&format!(
        "  #set page(paper: \"{}\")\n",
        escape_typst_string(paper_size)
    ));
}

fn push_project_text_settings(ast: &DocumentAST, builder: &mut SourceBuilder) {
    let settings = &ast.metadata.project_settings;
    let text_font = crate::font_availability::effective_font_family(
        settings.text_font.as_deref(),
        crate::font_availability::FontRole::Text,
    );
    if settings.text_font.is_some() {
        let size_str = settings
            .font_size
            .map(|s| format!(", size: {}pt", s))
            .unwrap_or_default();
        builder.push_literal(&format!(
            "  #set text(font: \"{}\"{})\n",
            escape_typst_string(&text_font),
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
}

pub(crate) fn resolve_param_builder(
    param: &ParamSpec,
    ast: &DocumentAST,
    fallbacks: &RequiredInputFallbacks<'_>,
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
        "settings" => resolve_setting_param(parts[1], ast, builder),
        "options" => resolve_option_param(parts[1], param, ast, builder),
        "inputs" | "cover_page" | "metadata" => {
            resolve_input_param(parts[1], param, ast, fallbacks, builder)
        }
        _ => false,
    }
}

fn resolve_option_param(
    option_id: &str,
    param: &ParamSpec,
    ast: &DocumentAST,
    builder: &mut SourceBuilder,
) -> bool {
    let key = format!("option.{option_id}");
    let Some(raw) = ast
        .metadata
        .project_settings
        .template_overrides
        .iter()
        .find(|entry| entry.key == key)
        .map(|entry| entry.value.as_str())
        .filter(|value| !value.trim().is_empty())
    else {
        return false;
    };

    match &param.param_type {
        ParamType::Boolean => {
            let enabled = raw.trim().eq_ignore_ascii_case("true");
            builder.push_literal(&enabled.to_string());
            true
        }
        ParamType::String => {
            builder.push_literal(&format!("\"{}\"", escape_typst_string(raw.trim())));
            true
        }
        ParamType::Integer => raw
            .trim()
            .parse::<i64>()
            .ok()
            .map(|value| {
                builder.push_literal(&value.to_string());
                true
            })
            .unwrap_or(false),
        ParamType::Float => raw
            .trim()
            .parse::<f64>()
            .ok()
            .map(|value| {
                builder.push_literal(&value.to_string());
                true
            })
            .unwrap_or(false),
        _ => false,
    }
}

fn resolve_setting_param(key: &str, ast: &DocumentAST, builder: &mut SourceBuilder) -> bool {
    let settings = &ast.metadata.project_settings;
    match key {
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

fn resolve_input_param(
    key: &str,
    param: &ParamSpec,
    ast: &DocumentAST,
    fallbacks: &RequiredInputFallbacks<'_>,
    builder: &mut SourceBuilder,
) -> bool {
    let raw = ast.inputs.get(key);
    let val = fallbacks.prepare_input_value(key, raw.unwrap_or(&serde_json::Value::Null));
    if raw.is_none() && !matches!(&param.param_type, ParamType::AuthorList) {
        return false;
    }

    match &param.param_type {
        ParamType::Content => {
            if let Some(content) = rich_text_array_from_value(&val) {
                if content.is_empty() {
                    if param.key != "_positional" {
                        return false;
                    }
                    builder.push_literal("[]");
                } else {
                    builder.push_literal("[");
                    rich_text::push_rich_text_field(
                        builder,
                        "inputs",
                        &format!("/{}", key),
                        &content,
                        &std::collections::HashMap::new(),
                    );
                    builder.push_literal("]");
                }
                return true;
            }

            if let Some(s) = val.as_str() {
                let text = fallbacks.effective_string(key, s);
                let trimmed = text.trim();
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
        ParamType::ContentArray => {
            // Multi-paragraph rich text. The value is an array of paragraphs, each a
            // `RichText[]`; they're emitted as one content block with `parbreak()`
            // between paragraphs. Legacy values are migrated: a plain string (from a
            // field that used to be `string`/`content`) or a single-paragraph
            // `RichText[]` becomes one paragraph.
            if let Some(s) = val.as_str() {
                let text = fallbacks.effective_string(key, s);
                let trimmed = text.trim();
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
                return true;
            }

            let paragraphs: Vec<Vec<RichText>> = match val.as_array() {
                Some(items) if items.first().map(|i| i.is_array()).unwrap_or(false) => {
                    items
                        .iter()
                        .map(|item| rich_text_array_from_value(item).unwrap_or_default())
                        .collect()
                }
                _ => rich_text_array_from_value(&val)
                    .map(|content| vec![content])
                    .unwrap_or_default(),
            };

            let non_empty: Vec<(usize, &Vec<RichText>)> = paragraphs
                .iter()
                .enumerate()
                .filter(|(_, para)| !para.is_empty())
                .collect();

            if non_empty.is_empty() {
                if param.key != "_positional" {
                    return false;
                }
                builder.push_literal("[]");
                return true;
            }

            builder.push_literal("[");
            for (rendered, (index, para)) in non_empty.iter().enumerate() {
                if rendered > 0 {
                    builder.push_literal(" #parbreak() ");
                }
                rich_text::push_rich_text_field(
                    builder,
                    "inputs",
                    &format!("/{}/{}", key, index),
                    para,
                    &std::collections::HashMap::new(),
                );
            }
            builder.push_literal("]");
            true
        }
        ParamType::String => {
            if let Some(s) = val.as_str() {
                let text = fallbacks.effective_string(key, s);
                if text.trim().is_empty() {
                    return false;
                }
                builder.push_literal("\"");
                builder.push_escaped_field("inputs", &format!("/{}", key), &text, 0);
                builder.push_literal("\"");
                true
            } else {
                false
            }
        }
        ParamType::Length => {
            if let Some(s) = val.as_str() {
                if let Some(length) = format_typst_length(s) {
                    builder.push_literal(&length);
                    true
                } else {
                    false
                }
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
        ParamType::StringArray => resolve_string_array_param(key, &val, builder),
        ParamType::Equation => push_equation_json_value(
            builder,
            &format!("/{key}"),
            &val,
            false,
        ),
        ParamType::Dictionary => {
            if val.is_object() {
                let obj = val.as_object().unwrap();
                builder.push_literal("(\n");
                let mut first = true;
                let mut sorted_keys: Vec<&String> = obj.keys().collect();
                sorted_keys.sort();
                for prop_key in sorted_keys {
                    let prop_val = obj.get(prop_key).unwrap();
                    if !first {
                        builder.push_literal(",\n");
                    }
                    first = false;
                    builder.push_literal(&format!("    {prop_key}: "));
                    push_dictionary_field_value(
                        builder,
                        &format!("/{key}/{prop_key}"),
                        prop_key,
                        prop_val,
                    );
                }
                builder.push_literal("\n  )");
                true
            } else if val.is_array() {
                let arr = val.as_array().unwrap();
                if arr.is_empty() {
                    builder.push_literal("()");
                    return true;
                }
                builder.push_literal("(\n");
                for (idx, item) in arr.iter().enumerate() {
                    if idx > 0 {
                        builder.push_literal(",\n");
                    }
                    builder.push_literal("    (\n");
                    if let Some(obj) = item.as_object() {
                        let mut first = true;
                        let mut sorted_keys: Vec<&String> = obj.keys().collect();
                        sorted_keys.sort();
                        for prop_key in sorted_keys {
                            let prop_val = obj.get(prop_key).unwrap();
                            if !first {
                                builder.push_literal(",\n");
                            }
                            first = false;
                            builder.push_literal(&format!("      {prop_key}: "));
                            push_dictionary_field_value(
                                builder,
                                &format!("/{key}/{idx}/{prop_key}"),
                                prop_key,
                                prop_val,
                            );
                        }
                    }
                    builder.push_literal("\n    )");
                }
                if arr.len() == 1 {
                    builder.push_literal(",");
                }
                builder.push_literal("\n  )");
                true
            } else {
                false
            }
        }
        ParamType::AuthorList => {
            resolve_author_list_param(&val, raw.unwrap_or(&serde_json::Value::Null), builder)
        }
        ParamType::AffiliationMap => {
            let letter_ids = ast.metadata.template_id == "umb-apa";
            resolve_affiliation_map_param(&val, builder, letter_ids, "affiliations")
        }
        ParamType::DegreeMap => resolve_degree_map_param(&val, builder),
    }
}

fn equation_field_is_block(prop_key: &str) -> bool {
    prop_key == "definition"
}

fn push_dictionary_field_value(
    builder: &mut SourceBuilder,
    field_path: &str,
    prop_key: &str,
    prop_val: &serde_json::Value,
) {
    if push_equation_json_value(builder, field_path, prop_val, equation_field_is_block(prop_key)) {
        return;
    }
    let prop_str = prop_val.as_str().unwrap_or("");
    builder.push_literal("[");
    builder.push_escaped_field("inputs", field_path, prop_str, 0);
    builder.push_literal("]");
}

fn push_equation_json_value(
    builder: &mut SourceBuilder,
    field_path: &str,
    val: &serde_json::Value,
    block: bool,
) -> bool {
    let Some(obj) = val.as_object() else {
        return false;
    };
    let Some(source) = obj.get("source").and_then(|value| value.as_str()) else {
        return false;
    };
    if source.trim().is_empty() {
        builder.push_literal("none");
        return true;
    }
    let syntax = obj
        .get("syntax")
        .and_then(|value| value.as_str())
        .unwrap_or("typst");
    let normalized = rich_text::normalize_math_source(source);
    if normalized.is_empty() {
        builder.push_literal("none");
        return true;
    }
    match syntax {
        "latex" => {
            let function = if block { "mitex" } else { "mi" };
            builder.push_literal(&format!("#{function}(\""));
            builder.push_escaped_field("inputs", field_path, &normalized, 0);
            builder.push_literal("\")");
        }
        _ => {
            builder.push_literal(&format!("#math.equation(block: {}, $", block));
            builder.push_raw_field("inputs", field_path, &normalized, 0);
            builder.push_literal("$)");
        }
    }
    true
}

fn resolve_string_array_param(
    key: &str,
    val: &serde_json::Value,
    builder: &mut SourceBuilder,
) -> bool {
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
                builder.push_escaped_field("inputs", &format!("/{}/{}", key, idx), s, 0);
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

fn resolve_author_list_param(
    val: &serde_json::Value,
    raw: &serde_json::Value,
    builder: &mut SourceBuilder,
) -> bool {
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
                    let field_id = format!("/authors/{}/name", idx);
                    if raw_author_name_is_empty(raw, idx) {
                        builder.push_escaped_generated_field_marker("inputs", &field_id, name, 0);
                    } else {
                        builder.push_escaped_field("inputs", &field_id, name, 0);
                    }
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
                if let Some(affs) = obj.get("affiliations").and_then(|v| v.as_array()) {
                    push_author_reference_list(
                        obj,
                        builder,
                        idx,
                        "affiliations",
                        affs,
                        &mut has_field,
                    );
                }
                if let Some(title_refs) = obj
                    .get("titles")
                    .or_else(|| obj.get("degrees"))
                    .and_then(|v| v.as_array())
                {
                    push_author_reference_list(
                        obj,
                        builder,
                        idx,
                        "titles",
                        title_refs,
                        &mut has_field,
                    );
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

fn raw_author_name_is_empty(raw: &serde_json::Value, index: usize) -> bool {
    raw.as_array()
        .and_then(|authors| authors.get(index))
        .and_then(|author| author.get("name"))
        .and_then(|name| name.as_str())
        .map(str::trim)
        .map(str::is_empty)
        .unwrap_or(true)
}

fn input_value_has_visible_text(value: &serde_json::Value) -> bool {
    if let Some(text) = value.as_str() {
        return !text.trim().is_empty();
    }

    if let Some(content) = rich_text_array_from_value(value) {
        return content.iter().any(|span| {
            if span.kind.as_deref() == Some("reference") {
                return true;
            }
            !span.text.trim().is_empty()
        });
    }

    false
}

fn affiliation_map_key(index: usize, letter_ids: bool) -> String {
    if letter_ids {
        char::from_u32(97 + index as u32)
            .map(|c| c.to_string())
            .unwrap_or_else(|| (index + 1).to_string())
    } else {
        (index + 1).to_string()
    }
}

fn push_author_reference_list(
    _obj: &serde_json::Map<String, serde_json::Value>,
    builder: &mut SourceBuilder,
    author_idx: usize,
    field: &str,
    refs: &[serde_json::Value],
    has_field: &mut bool,
) {
    let ref_values = refs
        .iter()
        .enumerate()
        .filter_map(|(ref_idx, value)| {
            value
                .as_str()
                .filter(|s| !s.trim().is_empty())
                .map(|s| (ref_idx, s))
        })
        .collect::<Vec<_>>();
    if ref_values.is_empty() {
        return;
    }
    if *has_field {
        builder.push_literal(", ");
    }
    builder.push_literal(&format!("{field}: ("));
    for (position, (ref_idx, ref_value)) in ref_values.iter().enumerate() {
        if position > 0 {
            builder.push_literal(", ");
        }
        builder.push_literal("\"");
        builder.push_escaped_field(
            "inputs",
            &format!("/authors/{author_idx}/{field}/{ref_idx}"),
            ref_value,
            0,
        );
        builder.push_literal("\"");
    }
    if ref_values.len() == 1 {
        builder.push_literal(",");
    }
    builder.push_literal(")");
    *has_field = true;
}

fn resolve_degree_map_param(val: &serde_json::Value, builder: &mut SourceBuilder) -> bool {
    resolve_affiliation_map_param(val, builder, true, "titles")
}

fn resolve_affiliation_map_param(
    val: &serde_json::Value,
    builder: &mut SourceBuilder,
    letter_ids: bool,
    field_prefix: &str,
) -> bool {
    if let Some(arr) = val.as_array() {
        let has_any = arr.iter().any(input_value_has_visible_text);
        if !has_any {
            builder.push_literal("(:)");
            return true;
        }
        builder.push_literal("(");
        let mut first = true;
        let bibliography_keys = std::collections::HashMap::new();
        let mut visible_index = 0usize;
        for (idx, item) in arr.iter().enumerate() {
            if let Some(aff_name) = item.as_str() {
                if aff_name.trim().is_empty() {
                    continue;
                }
                if !first {
                    builder.push_literal(", ");
                }
                first = false;
                let map_key = affiliation_map_key(visible_index, letter_ids);
                visible_index += 1;
                builder.push_literal(&format!("\"{map_key}\": ["));
                builder.push_escaped_field(
                    "inputs",
                    &format!("/{field_prefix}/{idx}"),
                    aff_name,
                    0,
                );
                builder.push_literal("]");
            } else if let Some(content) = rich_text_array_from_value(item) {
                if !input_value_has_visible_text(item) {
                    continue;
                }
                if !first {
                    builder.push_literal(", ");
                }
                first = false;
                let map_key = affiliation_map_key(visible_index, letter_ids);
                visible_index += 1;
                builder.push_literal(&format!("\"{map_key}\": ["));
                rich_text::push_rich_text_field(
                    builder,
                    "inputs",
                    &format!("/{field_prefix}/{idx}"),
                    &content,
                    &bibliography_keys,
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

fn rich_text_array_from_value(value: &serde_json::Value) -> Option<Vec<RichText>> {
    if let Ok(content) = serde_json::from_value::<Vec<RichText>>(value.clone()) {
        return Some(content);
    }

    None
}

pub(crate) fn format_json_val(val: &serde_json::Value, param_type: &ParamType) -> Option<String> {
    match (param_type, val) {
        (ParamType::Length, serde_json::Value::String(s)) => format_typst_length(s),
        (ParamType::Length, serde_json::Value::Number(n)) => format_typst_length_number(n),
        (ParamType::String, serde_json::Value::String(s)) => {
            Some(format!("\"{}\"", escape_typst_string(s)))
        }
        (ParamType::Boolean, serde_json::Value::Bool(b)) => Some(b.to_string()),
        (ParamType::Integer, serde_json::Value::Number(n)) => Some(n.to_string()),
        (ParamType::Float, serde_json::Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod option_param_tests {
    use super::*;
    use crate::ast::{
        DependencyManifest, DocumentAST, GlobalSettings, ProjectMetadata, ProjectSettings,
        TemplateOverride,
    };
    use crate::template_spec::{ParamSpec, ParamType};
    use std::collections::HashMap;

    fn ast_with_option(option_id: &str, value: &str) -> DocumentAST {
        DocumentAST {
            version: "1.0".to_string(),
            metadata: ProjectMetadata {
                template_id: "test".to_string(),
                template_variant_id: None,
                title: "Test".to_string(),
                running_head: None,
                keywords: vec![],
                project_settings: ProjectSettings {
                    template_overrides: vec![TemplateOverride {
                        key: format!("option.{option_id}"),
                        value: value.to_string(),
                    }],
                    ..ProjectSettings::default()
                },
                local_overrides: GlobalSettings::default(),
            },
            dependencies: DependencyManifest { packages: vec![] },
            references: vec![],
            assets: vec![],
            inputs: HashMap::new(),
            sections: vec![],
        }
    }

    #[test]
    fn resolve_option_param_emits_boolean_and_string() {
        let boolean_param = ParamSpec {
            key: "flag".to_string(),
            param_type: ParamType::Boolean,
            source: Some("options.my_flag".to_string()),
            label: None,
            default: None,
            required: false,
            variants: None,
        };
        let mut builder = SourceBuilder::default();
        assert!(resolve_option_param(
            "my_flag",
            &boolean_param,
            &ast_with_option("my_flag", "true"),
            &mut builder,
        ));
        assert_eq!(builder.source, "true");

        let string_param = ParamSpec {
            key: "mode".to_string(),
            param_type: ParamType::String,
            source: Some("options.mode".to_string()),
            label: None,
            default: None,
            required: false,
            variants: None,
        };
        let mut builder = SourceBuilder::default();
        assert!(resolve_option_param(
            "mode",
            &string_param,
            &ast_with_option("mode", "draft"),
            &mut builder,
        ));
        assert_eq!(builder.source, "\"draft\"");
    }
}
