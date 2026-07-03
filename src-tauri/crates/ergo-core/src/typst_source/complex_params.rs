//! Typst source emission for complex list/map input param types:
//! author lists, affiliation maps, and degree maps.
//!
//! These serialize multi-field JSON objects (authors with name/email/
//! affiliations/titles, affiliation maps with letter or numeric keys) into
//! Typst dictionary/array syntax with escaped field markers for the source
//! map. Extracted from the main `typst_source` module to isolate the
//! author/affiliation special-casing from general param resolution.

use crate::document_source_builder::SourceBuilder;

use super::rich_text;
use super::rich_text_array_from_value;

/// Emit an author list param `(name: [...], email: "...", ...)`. Returns false
/// if the value isn't a non-empty array (so the caller can skip the param).
pub(super) fn resolve_author_list_param(
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

/// Degree maps use letter keys (a, b, …) under a `titles` field prefix.
pub(super) fn resolve_degree_map_param(val: &serde_json::Value, builder: &mut SourceBuilder) -> bool {
    resolve_affiliation_map_param(val, builder, true, "titles")
}

/// Affiliation maps use numeric keys (1, 2, …) under an `affiliations` prefix.
pub(super) fn resolve_affiliation_map_param(
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
