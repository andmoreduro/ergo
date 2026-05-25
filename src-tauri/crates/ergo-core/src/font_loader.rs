use std::collections::{BTreeSet, HashSet};
use std::path::Path;

use fontdb::{Database, Family, Query, Source};

/// Loads font file bytes from installed system fonts for the given family names.
pub fn load_font_bytes_for_families(families: &[String]) -> Result<Vec<Vec<u8>>, String> {
    if families.is_empty() {
        return Ok(Vec::new());
    }

    let targets: BTreeSet<String> = families
        .iter()
        .map(|family| family.trim().to_ascii_lowercase())
        .filter(|family| !family.is_empty())
        .collect();

    let mut database = Database::new();
    database.load_system_fonts();

    let mut pending: HashSet<String> = targets.iter().cloned().collect();
    let mut buffers = Vec::new();
    let mut loaded_sources: HashSet<String> = HashSet::new();

    for face in database.faces() {
        if pending.is_empty() {
            break;
        }

        let matched: Vec<String> = face
            .families
            .iter()
            .filter_map(|(name, _)| {
                let normalized = name.trim().to_ascii_lowercase();
                if pending.contains(&normalized) {
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
                pending.remove(&family);
            }
            continue;
        }

        if let Ok(bytes) = read_font_source(&face.source) {
            buffers.push(bytes);
            for family in matched {
                pending.remove(&family);
            }
        }
    }

    for family in pending {
        let query = Query {
            families: &[Family::Name(family.as_str())],
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
