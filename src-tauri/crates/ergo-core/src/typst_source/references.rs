use std::collections::HashMap;

use crate::ast::ReferenceEntry;

use super::paths::label_for_id;

pub(crate) fn parse_biblatex_citation_key(biblatex: &str) -> Option<String> {
    let trimmed = biblatex.trim();
    let at = trimmed.find('@')?;
    let open = trimmed[at..].find('{')? + at;
    let after_open = &trimmed[open + 1..];
    let key_end = after_open
        .find(',')
        .unwrap_or_else(|| after_open.find('}').unwrap_or(after_open.len()));
    let key = after_open[..key_end].trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

/// Ensures Typst can parse minimal BibLaTeX entries such as `@book{key}`.
pub(crate) fn normalize_biblatex_entry(biblatex: &str) -> String {
    let trimmed = biblatex.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let Some(open) = trimmed.find('{') else {
        return trimmed.to_string();
    };
    let Some(close) = trimmed.rfind('}') else {
        return trimmed.to_string();
    };

    let body = trimmed[open + 1..close].trim();
    if body.is_empty() || body.contains(',') {
        return trimmed.to_string();
    }

    format!("{}{},\n}}", &trimmed[..=open], body)
}

pub(crate) fn generate_references_bib(references: &[ReferenceEntry]) -> String {
    if references.is_empty() {
        return String::new();
    }

    let mut source = references
        .iter()
        .map(|reference| normalize_biblatex_entry(reference.biblatex.trim()))
        .filter(|biblatex| !biblatex.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    if !source.ends_with('\n') {
        source.push('\n');
    }

    source
}

pub(crate) fn bibliography_citation_keys(references: &[ReferenceEntry]) -> HashMap<String, String> {
    references
        .iter()
        .filter_map(|reference| {
            let key = parse_biblatex_citation_key(&reference.biblatex)
                .filter(|key| !key.is_empty())
                .unwrap_or_else(|| reference.citation_key.clone());
            if key.is_empty() {
                None
            } else {
                Some((reference.id.clone(), key))
            }
        })
        .collect()
}

pub(crate) fn typst_reference_marker(
    reference_id: &str,
    bibliography_keys: &HashMap<String, String>,
) -> String {
    if let Some(citation_key) = bibliography_keys.get(reference_id) {
        format!("@{citation_key}")
    } else {
        format!("@{}", label_for_id(reference_id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_biblatex_adds_comma_after_bare_key() {
        assert_eq!(
            normalize_biblatex_entry("@book{ref-1}"),
            "@book{ref-1,\n}"
        );
    }

    #[test]
    fn parse_biblatex_citation_key_reads_entry_key() {
        assert_eq!(
            parse_biblatex_citation_key("@article{smith2020, title = {Demo}}"),
            Some("smith2020".to_string())
        );
    }

    #[test]
    fn typst_reference_marker_uses_bibliography_citation_key() {
        let keys = HashMap::from([(
            "ref-1".to_string(),
            "smith2020".to_string(),
        )]);
        assert_eq!(typst_reference_marker("ref-1", &keys), "@smith2020");
    }

    #[test]
    fn bibliography_keys_prefer_biblatex_entry_key() {
        let references = vec![ReferenceEntry {
            id: "ref-1".to_string(),
            citation_key: "ref-1".to_string(),
            biblatex: "@article{smith2020, title = {Demo}}".to_string(),
        }];
        let keys = bibliography_citation_keys(&references);
        assert_eq!(keys.get("ref-1"), Some(&"smith2020".to_string()));
    }
}
