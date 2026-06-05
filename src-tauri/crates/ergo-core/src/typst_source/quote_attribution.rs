use std::collections::HashMap;

use super::paths::label_for_id;
use super::escape_typst_string;

/// Typst `attribution:` argument for `#quote(...)`, from free text or a bibliography entry.
pub(crate) fn format_quote_attribution_param(
    text: Option<&str>,
    reference_id: Option<&str>,
    bibliography_keys: &HashMap<String, String>,
) -> Option<String> {
    if let Some(ref_id) = reference_id.filter(|id| !id.is_empty()) {
        return Some(typst_quote_attribution_reference(ref_id, bibliography_keys));
    }
    if let Some(raw) = text.filter(|value| !value.trim().is_empty()) {
        return Some(format!("[{}]", escape_typst_string(raw.trim())));
    }
    None
}

/// Bibliography attribution uses a Typst label (`<key>`), not an inline `@cite`.
pub(crate) fn typst_quote_attribution_reference(
    reference_id: &str,
    bibliography_keys: &HashMap<String, String>,
) -> String {
    if let Some(citation_key) = bibliography_keys.get(reference_id) {
        format!("<{citation_key}>")
    } else {
        format!("<{}>", label_for_id(reference_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn text_attribution_wraps_parenthetical_content() {
        assert_eq!(
            format_quote_attribution_param(
                Some("(Ervin et al., 2018, p. 470)"),
                None,
                &HashMap::new(),
            ),
            Some("[(Ervin et al., 2018, p. 470)]".to_string())
        );
    }

    #[test]
    fn reference_attribution_uses_citation_label() {
        let keys = HashMap::from([(
            "ref-1".to_string(),
            "smith2020".to_string(),
        )]);
        assert_eq!(
            format_quote_attribution_param(None, Some("ref-1"), &keys),
            Some("<smith2020>".to_string())
        );
    }

    #[test]
    fn reference_label_falls_back_to_element_label() {
        assert_eq!(
            typst_quote_attribution_reference("ref-uuid", &HashMap::new()),
            "<ergo-ref-uuid>"
        );
    }

    #[test]
    fn reference_takes_precedence_over_text() {
        let keys = HashMap::from([(
            "ref-1".to_string(),
            "smith2020".to_string(),
        )]);
        assert_eq!(
            format_quote_attribution_param(
                Some("(ignored)"),
                Some("ref-1"),
                &keys,
            ),
            Some("<smith2020>".to_string())
        );
    }
}
