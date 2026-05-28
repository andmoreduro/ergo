use crate::ast::TemplateOverride;

use super::escape_typst_string;

fn lookup_title<'a>(overrides: &'a [TemplateOverride], key: &str) -> Option<&'a str> {
    overrides
        .iter()
        .find(|entry| entry.key == key)
        .map(|entry| entry.value.as_str())
        .filter(|value| !value.trim().is_empty())
}

fn outline_title_arg(title: &str) -> String {
    format!("[{}]", escape_typst_string(title))
}

fn outline_line(target: Option<&str>, title: Option<&str>) -> String {
    let mut args = Vec::new();
    if let Some(target) = target {
        args.push(format!("target: {target}"));
    }
    if let Some(title) = title {
        args.push(format!("title: {}", outline_title_arg(title)));
    }

    let args = args.join(", ");
    format!("#outline({args})\n#pagebreak()\n")
}

pub(crate) fn generate_front_matter_outlines(overrides: &[TemplateOverride]) -> String {
    let mut out = String::new();
    out.push_str(&outline_line(
        None,
        lookup_title(overrides, "outline.contents_title"),
    ));
    out.push_str(&outline_line(
        Some("figure.where(kind: table)"),
        lookup_title(overrides, "outline.tables_title"),
    ));
    out.push_str(&outline_line(
        Some("figure.where(kind: image)"),
        lookup_title(overrides, "outline.figures_title"),
    ));
    out.push_str(&outline_line(
        Some("figure.where(kind: math.equation)"),
        lookup_title(overrides, "outline.equations_title"),
    ));
    out.push_str(&outline_line(
        Some("figure.where(kind: raw)"),
        lookup_title(overrides, "outline.listings_title"),
    ));
    out.push_str(&appendix_outline_line(lookup_title(
        overrides,
        "outline.appendices_title",
    )));
    out
}

fn appendix_outline_line(title: Option<&str>) -> String {
    let title_part = title
        .map(|value| format!("title: {}", outline_title_arg(value)))
        .unwrap_or_default();
    if title_part.is_empty() {
        "#appendix-outline()\n#pagebreak()\n".to_string()
    } else {
        format!("#appendix-outline({title_part})\n#pagebreak()\n")
    }
}
