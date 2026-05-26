use std::collections::HashMap;

use crate::ast::RichText;
use crate::document_source_builder::SourceBuilder;

use super::references::typst_reference_marker;

pub(crate) fn normalize_math_source(value: &str) -> String {
    value.trim().trim_matches('$').trim().to_string()
}

pub(crate) fn push_rich_text_field(
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
