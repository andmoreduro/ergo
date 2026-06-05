use crate::ast::TemplateOverride;
use crate::template_spec::{template_spec_exports_symbol, TemplateSpec};

use super::escape_typst_string;
use super::outline_titles::{
    default_bibliography_section_title, default_outline_title, BIBLIOGRAPHY_SECTION_TITLE,
    OUTLINE_APPENDICES_TITLE, OUTLINE_CONTENTS_TITLE, OUTLINE_EQUATIONS_TITLE,
    OUTLINE_FIGURES_TITLE, OUTLINE_LISTINGS_TITLE, OUTLINE_TABLES_TITLE,
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

fn umb_outlines_bool_arg(included: bool) -> &'static str {
    if included { "true" } else { "false" }
}

fn umb_outlines_title_arg(title: &str) -> String {
    format!("title: {}", outline_title_arg(title))
}

pub(crate) fn generate_front_matter_outlines(
    template: &TemplateSpec,
    document_language: Option<&str>,
    overrides: &[TemplateOverride],
) -> String {
    if template_spec_exports_symbol(template, "umb-outlines") {
        return generate_umb_outlines(template, document_language, overrides);
    }

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

pub(crate) fn effective_bibliography_section_title<'a>(
    document_language: Option<&str>,
    overrides: &'a [TemplateOverride],
) -> &'a str {
    lookup_title(overrides, BIBLIOGRAPHY_SECTION_TITLE)
        .unwrap_or_else(|| default_bibliography_section_title(document_language))
}

fn appendix_outline_line(title: &str) -> String {
    format!(
        "#appendix-outline(title: {})\n#pagebreak()\n",
        outline_title_arg(title)
    )
}

fn generate_umb_outlines(
    template: &TemplateSpec,
    document_language: Option<&str>,
    overrides: &[TemplateOverride],
) -> String {
    let include_contents = outline_included(template, overrides, OUTLINE_INCLUDE_CONTENTS);
    let include_tables = outline_included(template, overrides, OUTLINE_INCLUDE_TABLES);
    let include_figures = outline_included(template, overrides, OUTLINE_INCLUDE_FIGURES);
    let include_equations = outline_included(template, overrides, OUTLINE_INCLUDE_EQUATIONS);
    let include_listings = outline_included(template, overrides, OUTLINE_INCLUDE_LISTINGS);
    let include_appendices = outline_included(template, overrides, OUTLINE_INCLUDE_APPENDICES)
        && template_spec_exports_symbol(template, "appendix-outline");

    let contents_title = effective_outline_title(
        overrides,
        OUTLINE_CONTENTS_TITLE,
        document_language,
    );
    let tables_title = effective_outline_title(
        overrides,
        OUTLINE_TABLES_TITLE,
        document_language,
    );
    let figures_title = effective_outline_title(
        overrides,
        OUTLINE_FIGURES_TITLE,
        document_language,
    );
    let equations_title = effective_outline_title(
        overrides,
        OUTLINE_EQUATIONS_TITLE,
        document_language,
    );
    let listings_title = effective_outline_title(
        overrides,
        OUTLINE_LISTINGS_TITLE,
        document_language,
    );
    let appendices_title = effective_outline_title(
        overrides,
        OUTLINE_APPENDICES_TITLE,
        document_language,
    );

    format!(
        concat!(
            "#umb-outlines(\n",
            "  include-contents: {include_contents},\n",
            "  contents-{contents_title},\n",
            "  include-tables: {include_tables},\n",
            "  tables-{tables_title},\n",
            "  include-figures: {include_figures},\n",
            "  figures-{figures_title},\n",
            "  include-equations: {include_equations},\n",
            "  equations-{equations_title},\n",
            "  include-listings: {include_listings},\n",
            "  listings-{listings_title},\n",
            "  include-appendices: {include_appendices},\n",
            "  appendices-{appendices_title},\n",
            ")\n\n",
        ),
        include_contents = umb_outlines_bool_arg(include_contents),
        contents_title = umb_outlines_title_arg(contents_title),
        include_tables = umb_outlines_bool_arg(include_tables),
        tables_title = umb_outlines_title_arg(tables_title),
        include_figures = umb_outlines_bool_arg(include_figures),
        figures_title = umb_outlines_title_arg(figures_title),
        include_equations = umb_outlines_bool_arg(include_equations),
        equations_title = umb_outlines_title_arg(equations_title),
        include_listings = umb_outlines_bool_arg(include_listings),
        listings_title = umb_outlines_title_arg(listings_title),
        include_appendices = umb_outlines_bool_arg(include_appendices),
        appendices_title = umb_outlines_title_arg(appendices_title),
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
