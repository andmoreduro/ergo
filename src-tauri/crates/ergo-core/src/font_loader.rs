use std::collections::{BTreeSet, HashSet};
use std::path::Path;
use std::sync::OnceLock;

use fontdb::{Database, Family, Query, Source};

fn system_font_database() -> &'static Database {
    static DATABASE: OnceLock<Database> = OnceLock::new();
    DATABASE.get_or_init(|| {
        let mut database = Database::new();
        database.load_system_fonts();
        database
    })
}

/// Whether an installed system font advertises the given family name (case-insensitive).
pub fn family_is_installed(name: &str) -> bool {
    let normalized = name.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return false;
    }

    let database = system_font_database();
    database.faces().any(|face| {
        face.families.iter().any(|(family, _)| {
            family.trim().to_ascii_lowercase() == normalized
        })
    })
}

/// Enumerates every font family the compiler can render — installed system
/// fonts plus the families Typst embeds in its bundle — deduplicated and sorted.
///
/// Both sources matter: a chosen system family is fetched on demand by
/// [`load_font_bytes_for_families`], while bundled families (e.g. Libertinus,
/// New Computer Modern) are always available even when not installed OS-wide.
pub fn list_system_font_family_names() -> Vec<String> {
    let database = system_font_database();

    let mut families = BTreeSet::new();
    for face in database.faces() {
        for (name, _) in &face.families {
            families.insert(name.clone());
        }
    }
    families.extend(crate::font_requirements::bundled_font_families());
    families.into_iter().collect()
}

/// Loads font file bytes from installed system fonts for the given family names.
///
/// Every distinct font file (regular, bold, italic, etc.) for each requested family
/// is included so Typst can resolve `#strong` / `#emph` after `#set text(font: ...)`.
pub fn load_font_bytes_for_families(families: &[String]) -> Result<Vec<Vec<u8>>, String> {
    if families.is_empty() {
        return Ok(Vec::new());
    }

    let targets: BTreeSet<String> = families
        .iter()
        .map(|family| family.trim().to_ascii_lowercase())
        .filter(|family| !family.is_empty())
        .collect();

    let database = system_font_database();

    let mut buffers = Vec::new();
    let mut loaded_sources: HashSet<String> = HashSet::new();
    let mut families_with_data: HashSet<String> = HashSet::new();

    for face in database.faces() {
        let matched: Vec<String> = face
            .families
            .iter()
            .filter_map(|(name, _)| {
                let normalized = name.trim().to_ascii_lowercase();
                if targets.contains(&normalized) {
                    Some(normalized)
                } else {
                    None
                }
            })
            .collect();

        if matched.is_empty() {
            continue;
        }

        let source_key = source_key(&face.source);
        if !loaded_sources.insert(source_key) {
            for family in matched {
                families_with_data.insert(family);
            }
            continue;
        }

        if let Ok(bytes) = read_font_source(&face.source) {
            buffers.push(bytes);
            for family in matched {
                families_with_data.insert(family);
            }
        }
    }

    for family in targets.iter().filter(|family| !families_with_data.contains(*family)) {
        let family = family.as_str();
        let query = Query {
            families: &[Family::Name(family)],
            ..Default::default()
        };
        if let Some(id) = database.query(&query) {
            if let Some(face) = database.face(id) {
                let source_key = source_key(&face.source);
                if loaded_sources.insert(source_key) {
                    if let Ok(bytes) = read_font_source(&face.source) {
                        buffers.push(bytes);
                    }
                }
            }
        }
    }

    Ok(buffers)
}

fn source_key(source: &Source) -> String {
    match source {
        Source::File(path) => path.to_string_lossy().into_owned(),
        Source::SharedFile(path, _) => path.to_string_lossy().into_owned(),
        Source::Binary(_) => format!("binary:{:p}", source),
    }
}

fn read_font_source(source: &Source) -> Result<Vec<u8>, String> {
    match source {
        Source::File(path) | Source::SharedFile(path, _) => read_font_file(path),
        Source::Binary(bytes) => Ok(bytes.as_ref().as_ref().to_vec()),
    }
}

fn read_font_file(path: &Path) -> Result<Vec<u8>, String> {
    std::fs::read(path)
        .map_err(|error| format!("failed to read font file {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_system_font_family_names_is_sorted_and_deduplicated() {
        let families = list_system_font_family_names();

        // Bundled Typst families are always present, regardless of which fonts
        // the host has installed, so the list is never empty.
        assert!(
            families.iter().any(|name| name == "Libertinus Serif"),
            "bundled families must be included in the picker list",
        );

        // The list is derived from a `BTreeSet`, so it must be strictly
        // ascending — which also guarantees there are no duplicates.
        for window in families.windows(2) {
            assert!(
                window[0] < window[1],
                "family names must be sorted with no duplicates: {:?} !< {:?}",
                window[0],
                window[1],
            );
        }
    }
}
