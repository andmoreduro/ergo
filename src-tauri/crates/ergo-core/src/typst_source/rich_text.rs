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
                        EquationSyntax::Typst => {
                            format!("#math.equation(block: [{source}])")
                        }
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

        let bold = emphasis == RichTextEmphasis::Full && span.bold.unwrap_or(false);
        let italic = emphasis == RichTextEmphasis::Full && span.italic.unwrap_or(false);
        let underline = span.underline.unwrap_or(false);

        if underline {
            builder.push_literal("#underline[");
        }
        if bold {
            builder.push_literal("#strong[");
        }
        if italic {
            builder.push_literal("#emph[");
        }
        push_escaped_text_with_linebreaks(
            builder,
            element_id,
            field_id,
            &span.text,
            &mut field_utf16_offset,
        );
        if italic {
            builder.push_literal("]");
        }
        if bold {
            builder.push_literal("]");
        }
        if underline {
            builder.push_literal("]");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_source_builder::SourceBuilder;
    use crate::ast::{EquationSyntax, RichText};

    fn render_spans(content: &[RichText]) -> String {
        let mut builder = SourceBuilder::default();
        push_rich_text_field(
            &mut builder,
            "el-1",
            "el-1:text",
            content,
            &HashMap::new(),
        );
        builder.source
    }

    #[test]
    fn rich_text_uses_function_syntax_for_emphasis() {
        let source = render_spans(&[
            RichText {
                text: "bold".into(),
                bold: Some(true),
                italic: None,
                underline: None,
                kind: None,
                reference_id: None,
                equation_source: None,
                equation_syntax: EquationSyntax::Typst,
            },
            RichText {
                text: "mix".into(),
                bold: Some(true),
                italic: Some(true),
                underline: None,
                kind: None,
                reference_id: None,
                equation_source: None,
                equation_syntax: EquationSyntax::Typst,
            },
            RichText {
                text: "_not a delimiter_".into(),
                bold: Some(true),
                italic: None,
                underline: None,
                kind: None,
                reference_id: None,
                equation_source: None,
                equation_syntax: EquationSyntax::Typst,
            },
        ]);
        assert!(source.contains("#strong[bold]"));
        assert!(source.contains("#strong[#emph[mix]]"));
        assert!(source.contains("#strong[\\_not a delimiter\\_]"));
        assert!(!source.contains('*'));
    }

    #[test]
    fn rich_text_italic_and_underline_use_function_syntax() {
        let source = render_spans(&[RichText {
            text: "line".into(),
            bold: None,
            italic: Some(true),
            underline: Some(true),
            kind: None,
            reference_id: None,
            equation_source: None,
            equation_syntax: EquationSyntax::Typst,
        }]);
        assert_eq!(source, "#underline[#emph[line]]");
    }
}

fn push_escaped_text_with_linebreaks(
    builder: &mut SourceBuilder,
    element_id: &str,
    field_id: &str,
    text: &str,
    field_utf16_offset: &mut usize,
) {
    let mut parts = text.split('\n').peekable();
    while let Some(part) = parts.next() {
        if !part.is_empty() {
            builder.push_escaped_field(element_id, field_id, part, *field_utf16_offset);
            *field_utf16_offset += part.chars().map(char::len_utf16).sum::<usize>();
        }
        if parts.peek().is_some() {
            builder.push_literal("#linebreak()");
            *field_utf16_offset += 1;
        }
    }
}
