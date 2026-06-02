//! Default front-matter outline titles from document language (`ProjectSettings.language`).

pub(crate) const OUTLINE_CONTENTS_TITLE: &str = "outline.contents_title";
pub(crate) const OUTLINE_TABLES_TITLE: &str = "outline.tables_title";
pub(crate) const OUTLINE_FIGURES_TITLE: &str = "outline.figures_title";
pub(crate) const OUTLINE_EQUATIONS_TITLE: &str = "outline.equations_title";
pub(crate) const OUTLINE_LISTINGS_TITLE: &str = "outline.listings_title";
pub(crate) const OUTLINE_APPENDICES_TITLE: &str = "outline.appendices_title";

struct OutlineTitleSet {
    contents: &'static str,
    tables: &'static str,
    figures: &'static str,
    equations: &'static str,
    listings: &'static str,
    appendices: &'static str,
}

const EN: OutlineTitleSet = OutlineTitleSet {
    contents: "Contents",
    tables: "Tables",
    figures: "Figures",
    equations: "Equations",
    listings: "Listings",
    appendices: "Appendices",
};

const ES: OutlineTitleSet = OutlineTitleSet {
    contents: "Índice",
    tables: "Tablas",
    figures: "Figuras",
    equations: "Ecuaciones",
    listings: "Listados",
    appendices: "Apéndices",
};

/// Primary language tag from `ProjectSettings.language` (e.g. `es-MX` → `es`).
pub(crate) fn normalize_document_language(language: Option<&str>) -> &str {
    let Some(raw) = language.map(str::trim).filter(|value| !value.is_empty()) else {
        return "en";
    };
    let primary = raw.split(['-', '_']).next().unwrap_or(raw);
    if primary.eq_ignore_ascii_case("es") {
        "es"
    } else {
        "en"
    }
}

fn title_set_for_language(language: Option<&str>) -> &'static OutlineTitleSet {
    match normalize_document_language(language) {
        "es" => &ES,
        _ => &EN,
    }
}

pub(crate) fn default_outline_title(language: Option<&str>, title_key: &str) -> &'static str {
    let titles = title_set_for_language(language);
    match title_key {
        OUTLINE_CONTENTS_TITLE => titles.contents,
        OUTLINE_TABLES_TITLE => titles.tables,
        OUTLINE_FIGURES_TITLE => titles.figures,
        OUTLINE_EQUATIONS_TITLE => titles.equations,
        OUTLINE_LISTINGS_TITLE => titles.listings,
        OUTLINE_APPENDICES_TITLE => titles.appendices,
        _ => EN.contents,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spanish_document_language_uses_spanish_defaults() {
        assert_eq!(
            default_outline_title(Some("es"), OUTLINE_TABLES_TITLE),
            "Tablas"
        );
        assert_eq!(
            default_outline_title(Some("es-MX"), OUTLINE_FIGURES_TITLE),
            "Figuras"
        );
    }

    #[test]
    fn unknown_language_falls_back_to_english() {
        assert_eq!(
            default_outline_title(Some("de"), OUTLINE_LISTINGS_TITLE),
            "Listings"
        );
        assert_eq!(default_outline_title(None, OUTLINE_CONTENTS_TITLE), "Contents");
    }
}
