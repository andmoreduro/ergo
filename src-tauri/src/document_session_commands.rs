use tauri::State;

use crate::app_state::TauriAppState;
use crate::ast::{AssetEntry, DocumentAST};
use crate::document_session::{DocumentEvent, DocumentSessionStatus};
use crate::path_utils::normalize_virtual_path;

#[tauri::command]
pub fn sync_document_snapshot(
    state: State<'_, TauriAppState>,
    ast: DocumentAST,
) -> Result<DocumentSessionStatus, String> {
    Ok(state.document_session.sync_snapshot(ast)?)
}

#[tauri::command]
pub fn sync_document_event(
    state: State<'_, TauriAppState>,
    event: DocumentEvent,
) -> Result<DocumentSessionStatus, String> {
    Ok(state.document_session.apply_event(event)?)
}

#[tauri::command]
pub fn sync_document_events(
    state: State<'_, TauriAppState>,
    events: Vec<DocumentEvent>,
) -> Result<DocumentSessionStatus, String> {
    Ok(state.document_session.apply_events(events)?)
}

#[tauri::command]
pub fn get_document_session_status(
    state: State<'_, TauriAppState>,
) -> Result<DocumentSessionStatus, String> {
    Ok(state.document_session.status())
}

#[derive(serde::Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ImportResourceResult {
    pub asset: AssetEntry,
    pub bytes: Vec<u8>,
}

#[tauri::command]
pub fn read_vfs_file(state: State<'_, TauriAppState>, path: String) -> Result<Vec<u8>, String> {
    state.vfs.read_file(&path)
}

#[tauri::command]
pub fn write_generated_asset(
    state: State<'_, TauriAppState>,
    path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let path = normalize_virtual_path(&path);
    if !is_generated_diagram_asset_path(&path) {
        return Err("Generated assets can only be written under assets/diagrams/*.svg".to_string());
    }
    state.vfs.write_file(&path, bytes);
    Ok(())
}

#[tauri::command]
pub fn import_resource_file(
    state: State<'_, TauriAppState>,
    source_path: String,
) -> Result<ImportResourceResult, String> {
    let asset = import_resource_file_into_vfs(&state.vfs, source_path)?;
    let bytes = state.vfs.read_file(&asset.path)?;
    Ok(ImportResourceResult { asset, bytes })
}

#[tauri::command]
pub fn import_resource_bytes(
    state: State<'_, TauriAppState>,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<ImportResourceResult, String> {
    let asset = import_resource_bytes_into_vfs(&state.vfs, &file_name, bytes)?;
    let stored = state.vfs.read_file(&asset.path)?;
    Ok(ImportResourceResult {
        asset,
        bytes: stored,
    })
}

fn is_generated_diagram_asset_path(path: &str) -> bool {
    path.starts_with("assets/diagrams/")
        && path.ends_with(".svg")
        && !path.contains("..")
        && path
            .strip_prefix("assets/diagrams/")
            .map(|file_name| !file_name.is_empty() && !file_name.contains('/'))
            .unwrap_or(false)
}

pub(crate) fn import_resource_file_into_vfs(
    vfs: &crate::vfs::VirtualFileSystem,
    source_path: String,
) -> Result<AssetEntry, String> {
    let bytes = std::fs::read(&source_path).map_err(|error| error.to_string())?;
    let source = std::path::Path::new(&source_path);
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Imported resource must have a file name".to_string())?;
    import_resource_bytes_into_vfs(vfs, file_name, bytes)
}

pub(crate) fn import_resource_bytes_into_vfs(
    vfs: &crate::vfs::VirtualFileSystem,
    file_name: &str,
    bytes: Vec<u8>,
) -> Result<AssetEntry, String> {
    let path = unique_asset_path(vfs, file_name);
    vfs.write_file(&path, bytes);

    Ok(AssetEntry {
        id: asset_id_for_import_file_name(file_name),
        path,
        kind: kind_for_file_name(file_name).to_string(),
        caption: None,
    })
}

fn asset_id_for_import_file_name(file_name: &str) -> String {
    let sanitized = sanitize_file_name(file_name);
    let stem = sanitized
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(sanitized.as_str());
    if let Some(id) = stem.strip_prefix("image-") {
        if uuid::Uuid::parse_str(id).is_ok() {
            return id.to_string();
        }
    }
    uuid::Uuid::new_v4().to_string()
}

fn unique_asset_path(vfs: &crate::vfs::VirtualFileSystem, file_name: &str) -> String {
    let sanitized = sanitize_file_name(file_name);
    let (stem, extension) = sanitized
        .rsplit_once('.')
        .map(|(stem, extension)| (stem.to_string(), format!(".{extension}")))
        .unwrap_or_else(|| (sanitized.clone(), String::new()));
    let mut candidate = normalize_virtual_path(&format!("assets/{sanitized}"));
    let mut suffix = 2;

    while vfs.has_file(&candidate) {
        candidate = normalize_virtual_path(&format!("assets/{stem}-{suffix}{extension}"));
        suffix += 1;
    }

    candidate
}

fn sanitize_file_name(file_name: &str) -> String {
    let mut sanitized = String::new();
    for character in file_name.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
            sanitized.push(character);
        } else {
            sanitized.push('-');
        }
    }

    let sanitized = sanitized.trim_matches('-').to_string();
    if sanitized.is_empty() {
        "resource".to_string()
    } else {
        sanitized
    }
}

fn kind_for_file_name(file_name: &str) -> &'static str {
    let lower = file_name.to_ascii_lowercase();
    if [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]
        .iter()
        .any(|extension| lower.ends_with(extension))
    {
        "image"
    } else {
        "file"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vfs::VirtualFileSystem;
    use std::fs;
    use uuid::Uuid;

    #[test]
    fn import_resource_bytes_uses_uuid_from_image_prefixed_file_name() {
        let vfs = VirtualFileSystem::new();
        let id = "550e8400-e29b-41d4-a716-446655440000";
        let asset = import_resource_bytes_into_vfs(
            &vfs,
            &format!("image-{id}.png"),
            vec![137, 80, 78, 71],
        )
        .unwrap();

        assert_eq!(asset.id, id);
        assert_eq!(asset.path, format!("assets/image-{id}.png"));
    }

    #[test]
    fn import_resource_bytes_writes_unique_assets_path() {
        let vfs = VirtualFileSystem::new();
        vfs.write_file("assets/pasted.png", vec![1, 2, 3]);

        let asset =
            import_resource_bytes_into_vfs(&vfs, "pasted.png", vec![137, 80, 78, 71]).unwrap();

        assert_eq!(asset.kind, "image");
        assert_eq!(asset.path, "assets/pasted-2.png");
        assert_eq!(
            vfs.read_file("assets/pasted-2.png").unwrap(),
            vec![137, 80, 78, 71]
        );
    }

    #[test]
    fn import_resource_file_copies_bytes_to_unique_assets_path() {
        let vfs = VirtualFileSystem::new();
        vfs.write_file("assets/chart.png", vec![1, 2, 3]);
        let source_dir = std::env::temp_dir().join(format!("ergo-import-{}", Uuid::new_v4()));
        fs::create_dir_all(&source_dir).unwrap();
        let source_path = source_dir.join("chart.png");
        fs::write(&source_path, [137, 80, 78, 71]).unwrap();

        let asset =
            import_resource_file_into_vfs(&vfs, source_path.to_string_lossy().to_string()).unwrap();
        fs::remove_dir_all(&source_dir).ok();

        assert_eq!(asset.kind, "image");
        assert_eq!(asset.caption, None);
        assert_eq!(asset.path, "assets/chart-2.png");
        assert_eq!(
            vfs.read_file("assets/chart-2.png").unwrap(),
            vec![137, 80, 78, 71]
        );
    }
}
