use crate::document_source_builder::SourceBuilder;
use crate::template_spec::{ElementOverrideSpec, ParamType};

use super::{format_typst_length, format_typst_length_number};

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

pub(crate) fn push_override_extra_fields(
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

pub(crate) fn format_json_val_for_custom_field(
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
        (ParamType::Content, serde_json::Value::Array(items)) => {
            if let Ok(content) = serde_json::from_value::<Vec<crate::ast::RichText>>(
                serde_json::Value::Array(items.clone()),
            ) {
                builder.push_literal("[");
                super::rich_text::push_rich_text_field(
                    builder,
                    element_id,
                    &field_id,
                    &content,
                    &std::collections::HashMap::new(),
                );
                builder.push_literal("]");
            }
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

pub(crate) fn figure_body_field_id(element_id: &str) -> String {
    format!("{element_id}:body")
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
        "degree_map" => ParamType::DegreeMap,
        _ => ParamType::String,
    }
}
