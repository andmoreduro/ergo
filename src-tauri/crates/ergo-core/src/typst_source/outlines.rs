use crate::ast::TemplateOverride;
use crate::template_spec::{template_spec_exports_symbol, TemplateSpec};

use super::escape_typst_string;
use super::outline_titles::{
    default_outline_title, OUTLINE_APPENDICES_TITLE, OUTLINE_CONTENTS_TITLE,
    OUTLINE_EQUATIONS_TITLE, OUTLINE_FIGURES_TITLE, OUTLINE_LISTINGS_TITLE, OUTLINE_TABLES_TITLE,
};

pub(crate) const OUTLINE_INCLUDE_CONTENTS: &str = "outline.include_contents";
pub(crate) const OUTLINE_INCLUDE_TABLES: &str = "outline.include_tables";
pub(crate) const OUTLINE_INCLUDE_FIGURES: &str = "outline.include_figures";
pub(crate) const OUTLINE_INCLUDE_EQUATIONS: &str = "outline.include_equations";
pub(crate) const OUTLINE_INCLUDE_LISTINGS: &str = "outline.include_listings";
pub(crate) const OUTLINE_INCLUDE_APPENDICES: &str = "outline.include_appendices";

fn lookup_title<'a>(overrides: &'a [TemplateOverride], key: &str) -> Option<&'a str> {
    overrides
        .iter()
        .find(|entry| entry.key == key)
        .map(|entry| entry.value.as_str())
        .filter(|value| !value.trim().is_empty())
}

fn effective_outline_title<'a>(
    overrides: &'a [TemplateOverride],
    key: &str,
    document_language: Option<&str>,
) -> &'a str {
    lookup_title(overrides, key).unwrap_or_else(|| default_outline_title(document_language, key))
}

fn outline_included(
    template: &TemplateSpec,
    project_overrides: &[TemplateOverride],
    key: &str,
) -> bool {
    let resolve = |overrides: &[TemplateOverride]| {
        overrides
            .iter()
            .find(|entry| entry.key == key)
            .map(|entry| entry.value.trim().eq_ignore_ascii_case("false"))
            .map(|disabled| !disabled)
    };

    if let Some(included) = resolve(project_overrides) {
        return included;
    }
    if let Some(included) = resolve(&template.typst.default_template_overrides) {
        return included;
    }
    true
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

pub(crate) fn generate_front_matter_outlines(
    template: &TemplateSpec,
    document_language: Option<&str>,
    overrides: &[TemplateOverride],
) -> String {
    let mut out = String::new();

    if outline_included(template, overrides, OUTLINE_INCLUDE_CONTENTS) {
        out.push_str(&outline_line(
            None,
            Some(effective_outline_title(
                overrides,
                OUTLINE_CONTENTS_TITLE,
                document_language,
            )),
        ));
    }
    if outline_included(template, overrides, OUTLINE_INCLUDE_TABLES) {
        out.push_str(&outline_line(
            Some("figure.where(kind: table)"),
            Some(effective_outline_title(
                overrides,
                OUTLINE_TABLES_TITLE,
                document_language,
            )),
        ));
    }
    if outline_included(template, overrides, OUTLINE_INCLUDE_FIGURES) {
        out.push_str(&outline_line(
            Some("figure.where(kind: image)"),
            Some(effective_outline_title(
                overrides,
                OUTLINE_FIGURES_TITLE,
                document_language,
            )),
        ));
    }
    if outline_included(template, overrides, OUTLINE_INCLUDE_EQUATIONS) {
        out.push_str(&outline_line(
            Some("figure.where(kind: math.equation)"),
            Some(effective_outline_title(
                overrides,
                OUTLINE_EQUATIONS_TITLE,
                document_language,
            )),
        ));
    }
    if outline_included(template, overrides, OUTLINE_INCLUDE_LISTINGS) {
        out.push_str(&outline_line(
            Some("figure.where(kind: raw)"),
            Some(effective_outline_title(
                overrides,
                OUTLINE_LISTINGS_TITLE,
                document_language,
            )),
        ));
    }
    if outline_included(template, overrides, OUTLINE_INCLUDE_APPENDICES)
        && template_spec_exports_symbol(template, "appendix-outline")
    {
        out.push_str(&appendix_outline_line(effective_outline_title(
            overrides,
            OUTLINE_APPENDICES_TITLE,
            document_language,
        )));
    }

    out
}

fn appendix_outline_line(title: &str) -> String {
    format!(
        "#appendix-outline(title: {})\n#pagebreak()\n",
        outline_title_arg(title)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::TemplateOverride;
    use crate::template_spec::load_bundled_template;

    #[test]
    fn plain_template_skips_appendix_outline() {
        let template = load_bundled_template("none").unwrap();
        let source = generate_front_matter_outlines(&template, Some("en"), &[]);
        assert!(source.is_empty());
    }

    #[test]
    fn omits_disabled_outline_sections() {
        let template = load_bundled_template("apa7").unwrap();
        let overrides = vec![TemplateOverride {
            key: OUTLINE_INCLUDE_TABLES.to_string(),
            value: "false".to_string(),
        }];
        let source = generate_front_matter_outlines(&template, Some("en"), &overrides);
        assert!(source.contains("title: [Contents]"));
        assert!(!source.contains("kind: table"));
    }

    #[test]
    fn includes_configured_outline_title() {
        let template = load_bundled_template("apa7").unwrap();
        let overrides = vec![TemplateOverride {
            key: "outline.figures_title".to_string(),
            value: "Illustrations".to_string(),
        }];
        let source = generate_front_matter_outlines(&template, Some("en"), &overrides);
        assert!(source.contains("title: [Illustrations]"));
    }

    #[test]
    fn uses_document_language_when_override_missing() {
        let template = load_bundled_template("apa7").unwrap();
        let source = generate_front_matter_outlines(&template, Some("es"), &[]);
        assert!(source.contains("title: [Índice]"));
        assert!(source.contains("title: [Tablas]"));
        assert!(source.contains("title: [Figuras]"));
    }

    #[test]
    fn plain_template_outlines_off_until_project_override() {
        let template = load_bundled_template("none").unwrap();
        let disabled = generate_front_matter_outlines(&template, Some("en"), &[]);
        assert!(disabled.is_empty());

        let overrides = vec![TemplateOverride {
            key: OUTLINE_INCLUDE_FIGURES.to_string(),
            value: "true".to_string(),
        }];
        let enabled = generate_front_matter_outlines(&template, Some("en"), &overrides);
        assert!(enabled.contains("title: [Figures]"));
    }
}
