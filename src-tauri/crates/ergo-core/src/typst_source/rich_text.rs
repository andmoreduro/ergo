use std::collections::HashMap;

use crate::ast::{EquationSyntax, RichText};
use crate::document_source_builder::SourceBuilder;

use super::escape_typst_string;
use super::references::typst_reference_marker;

pub(crate) fn normalize_math_source(value: &str) -> String {
    value.trim().trim_matches('$').trim().to_string()
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum RichTextEmphasis {
    Full,
    /// Headings are already rendered in bold by Typst; skip weight emphasis delimiters.
    NoWeight,
}

pub(crate) fn push_rich_text_field(
    builder: &mut SourceBuilder,
    element_id: &str,
    field_id: &str,
    content: &[RichText],
    bibliography_keys: &HashMap<String, String>,
) {
    push_rich_text_field_with_emphasis(
        builder,
        element_id,
        field_id,
        content,
        bibliography_keys,
        RichTextEmphasis::Full,
    );
}

pub(crate) fn push_rich_text_field_with_emphasis(
    builder: &mut SourceBuilder,
    element_id: &str,
    field_id: &str,
    content: &[RichText],
    bibliography_keys: &HashMap<String, String>,
    emphasis: RichTextEmphasis,
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
                    let generated = match span.equation_syntax {
                        EquationSyntax::Latex => {
                            format!("#mi(\"{}\")", escape_typst_string(&source))
                        }
                        EquationSyntax::Typst => format!("${source}$"),
                    };
                    builder.push_generated_field_marker(
                        element_id,
                        field_id,
                        &generated,
                        field_utf16_offset,
                    );
                }
                field_utf16_offset += equation_source.chars().map(char::len_utf16).sum::<usize>();
            }
            continue;
        }

        if span.underline.unwrap_or(false) {
            builder.push_literal("#underline[");
        }

        let bold = emphasis == RichTextEmphasis::Full && span.bold.unwrap_or(false);
        let italic = emphasis == RichTextEmphasis::Full && span.italic.unwrap_or(false);
        let (prefix, suffix) = match (bold, italic) {
            (true, true) => ("*_", "_*"),
            (true, false) => ("*", "*"),
            (false, true) => ("_", "_"),
            (false, false) => ("", ""),
        };
        builder.push_literal(prefix);
        builder.push_escaped_field(element_id, field_id, &span.text, field_utf16_offset);
        builder.push_literal(suffix);
        if span.underline.unwrap_or(false) {
            builder.push_literal("]");
        }
        field_utf16_offset += span.text.chars().map(char::len_utf16).sum::<usize>();
    }
}
