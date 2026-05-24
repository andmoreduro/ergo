use tauri::{AppHandle, Emitter, State};

use crate::app_state::TauriAppState;
use crate::ast::{AssetEntry, DocumentAST};
use crate::document_session::{DocumentEvent, DocumentSessionStatus};
use crate::compile_events::RESOURCES_UPDATED_EVENT;
use crate::path_utils::normalize_virtual_path;
use crate::resource_watch;

#[tauri::command]
pub fn sync_document_snapshot(
    app: AppHandle,
    state: State<'_, TauriAppState>,
    ast: DocumentAST,
) -> Result<DocumentSessionStatus, String> {
    let status = state.document_session.sync_snapshot(ast)?;
    schedule_resource_catalog_update(&app, &state);
    Ok(status)
}

#[tauri::command]
pub fn sync_document_event(
    app: AppHandle,
    state: State<'_, TauriAppState>,
    event: DocumentEvent,
) -> Result<DocumentSessionStatus, String> {
    let status = state.document_session.apply_event(event)?;
    if !status.dirty_resource_ids.is_empty() {
        schedule_resource_catalog_update(&app, &state);
    }
    Ok(status)
}

#[tauri::command]
pub fn sync_document_events(
    app: AppHandle,
    state: State<'_, TauriAppState>,
    events: Vec<DocumentEvent>,
) -> Result<DocumentSessionStatus, String> {
    let mut status = state.document_session.status();
    for event in events {
        status = state.document_session.apply_event(event)?;
    }
    if !status.dirty_resource_ids.is_empty() {
        schedule_resource_catalog_update(&app, &state);
    }
    Ok(status)
}

fn schedule_resource_catalog_update(app: &AppHandle, state: &TauriAppState) {
    let Some(ast) = state.document_session.ast() else {
        return;
    };
    let template = crate::template_spec::load_bundled_template(&ast.metadata.template_id)
        .unwrap_or_else(|_| crate::template_spec::load_bundled_template("versatile-apa").unwrap());
    let lib_source = crate::document_resources::resource_preview_lib_source(&ast, &template);
    resource_watch::write_resource_files(&state.vfs, &ast, &template, &lib_source);
    let resources = resource_watch::build_resource_catalog(&ast, &template, &state.vfs);
    let _ = app.emit(RESOURCES_UPDATED_EVENT, resources);
    state
        .typst_watch
        .ensure_running(app.clone(), state.document_session.clone());
    state.typst_watch.mark_resources_pending();
}

#[tauri::command]
pub fn get_document_session_status(
    state: State<'_, TauriAppState>,
) -> Result<DocumentSessionStatus, String> {
    Ok(state.document_session.status())
}

#[tauri::command]
pub fn read_resource_preview_svg(
    state: State<'_, TauriAppState>,
    path: String,
) -> Result<String, String> {
    if !path.starts_with(".ergproj/resource-previews/svg/") {
        return Err(
            "Resource preview SVG path must be inside .ergproj/resource-previews/svg".to_string(),
        );
    }

    let bytes = state.vfs.read_file(&path)?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}

#[derive(serde::Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/bindings/")]
#[serde(rename_all = "camelCase")]
pub struct ImportResourceResult {
    pub asset: AssetEntry,
    pub bytes: Vec<u8>,
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
    let path = unique_asset_path(vfs, file_name);
    vfs.write_file(&path, bytes);

    Ok(AssetEntry {
        id: uuid::Uuid::new_v4().to_string(),
        path,
        kind: kind_for_file_name(file_name).to_string(),
        caption: None,
    })
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
