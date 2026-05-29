use std::collections::BTreeSet;
use std::sync::OnceLock;

use typst::foundations::Bytes;
use typst::text::Font;

use crate::ast::{DocumentAST, ProjectSettings};

fn normalize_family(name: &str) -> String {
    name.trim().to_ascii_lowercase()
}

/// Font families referenced by project settings (text, math, raw).
pub fn required_font_families(ast: &DocumentAST) -> BTreeSet<String> {
    collect_font_families_from_settings(&ast.metadata.project_settings)
}

pub fn collect_font_families_from_settings(settings: &ProjectSettings) -> BTreeSet<String> {
    let mut families = BTreeSet::new();
    for font in [
        settings.text_font.as_deref(),
        settings.math_font.as_deref(),
        settings.raw_font.as_deref(),
    ] {
        if let Some(name) = font.filter(|name| !name.trim().is_empty()) {
            families.insert(name.trim().to_string());
        }
    }
    families
}

/// Families available from Typst's embedded font bundle (Libertinus, New Computer Modern, DejaVu Mono, …).
pub fn bundled_font_families() -> BTreeSet<String> {
    static FAMILIES: OnceLock<BTreeSet<String>> = OnceLock::new();
    FAMILIES
        .get_or_init(|| {
            let mut families = BTreeSet::new();
            for data in typst_assets::fonts() {
                for font in Font::iter(Bytes::new(data.to_vec())) {
                    families.insert(font.info().family.clone());
                }
            }
            families
        })
        .clone()
}

/// Returns required families that are not satisfied by bundled fonts (case-insensitive).
pub fn families_missing_from_bundled(required: &BTreeSet<String>) -> Vec<String> {
    let bundled: BTreeSet<String> = bundled_font_families()
        .into_iter()
        .map(|name| normalize_family(&name))
        .collect();

    required
        .iter()
        .filter(|family| !bundled.contains(&normalize_family(family)))
        .cloned()
        .collect()
}

pub fn family_is_bundled(family: &str) -> bool {
    bundled_font_families()
        .iter()
        .any(|bundled| normalize_family(bundled) == normalize_family(family))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_fixtures::basic_document_ast;

    #[test]
    fn default_document_font_requirements() {
        let ast = basic_document_ast("Test", "");
        let required = required_font_families(&ast);
        assert!(required.contains("Libertinus Serif"));
        assert!(required.contains("Libertinus Math"));
        assert!(required.contains("DejaVu Sans Mono"));
        let missing = families_missing_from_bundled(&required);
        assert!(family_is_bundled("Libertinus Serif"));
        assert!(family_is_bundled("DejaVu Sans Mono"));
        // Typst embeds New Computer Modern Math, not Libertinus Math.
        assert!(missing.is_empty() || missing == vec!["Libertinus Math".to_string()]);
    }

    #[test]
    fn non_bundled_family_is_reported_missing() {
        let mut required = BTreeSet::new();
        required.insert("Arial".to_string());
        let missing = families_missing_from_bundled(&required);
        assert_eq!(missing, vec!["Arial".to_string()]);
    }
}
