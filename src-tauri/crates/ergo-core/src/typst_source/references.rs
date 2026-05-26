use std::collections::HashMap;

use crate::ast::ReferenceEntry;

use super::paths::label_for_id;

pub(crate) fn generate_references_bib(references: &[ReferenceEntry]) -> String {
    if references.is_empty() {
        return String::new();
    }

    let mut source = references
        .iter()
        .map(|reference| reference.biblatex.trim())
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
        .map(|reference| (reference.id.clone(), reference.citation_key.clone()))
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
