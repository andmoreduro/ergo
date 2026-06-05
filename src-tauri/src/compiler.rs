use std::fs::File;
use std::io::Write;

use tauri::{State, WebviewWindow};

use crate::app_state::TauriAppState;
use crate::ast::DocumentAST;
use crate::ast::ProjectSettings;
use crate::font_availability::{
    check_project_font_availability, resolve_project_settings_fonts, ProjectFontAvailability,
};
use crate::font_loader::{list_system_font_family_names, load_font_bytes_for_families};
use crate::font_requirements::{families_missing_from_bundled, required_font_families};

#[tauri::command]
pub fn load_fonts_for_families(families: Vec<String>) -> Result<Vec<Vec<u8>>, String> {
    let missing = families_missing_from_bundled(
        &families
            .into_iter()
            .filter(|family| !family.trim().is_empty())
            .collect(),
    );
    load_font_bytes_for_families(&missing)
}

#[tauri::command]
pub fn list_system_font_families() -> Vec<String> {
    list_system_font_family_names()
}

#[tauri::command]
pub fn load_fonts_for_document(ast: DocumentAST) -> Result<Vec<Vec<u8>>, String> {
    let resolved = resolve_project_settings_fonts(&ast.metadata.project_settings);
    let mut resolved_ast = ast;
    resolved_ast.metadata.project_settings = resolved;
    let required = required_font_families(&resolved_ast);
    let missing = families_missing_from_bundled(&required);
    load_font_bytes_for_families(&missing)
}

#[tauri::command]
pub fn check_project_fonts(settings: ProjectSettings) -> ProjectFontAvailability {
    check_project_font_availability(&settings)
}

#[tauri::command]
pub fn resolve_project_fonts(settings: ProjectSettings) -> ProjectSettings {
    resolve_project_settings_fonts(&settings)
}

#[tauri::command]
pub fn write_source(
    state: State<'_, TauriAppState>,
    path: String,
    text: String,
) -> Result<(), String> {
    state.vfs.write_source(&path, text);
    Ok(())
}

#[tauri::command]
pub fn patch_source(
    state: State<'_, TauriAppState>,
    path: String,
    start: usize,
    end: usize,
    text: String,
) -> Result<(), String> {
    state.vfs.apply_patch(&path, start, end, &text)?;
    Ok(())
}

#[tauri::command]
pub fn write_bytes_to_path(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create export directory: {error}"))?;
        }
    }

    std::fs::write(&path, &bytes).map_err(|error| format!("failed to write export file: {error}"))
}

#[derive(serde::Deserialize)]
pub struct ZipExportEntry {
    pub name: String,
    pub bytes: Vec<u8>,
}

#[tauri::command]
pub fn write_zip_export(path: String, entries: Vec<ZipExportEntry>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create export directory: {error}"))?;
        }
    }

    let file =
        File::create(&path).map_err(|error| format!("failed to create zip file: {error}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for entry in entries {
        zip.start_file(entry.name, options)
            .map_err(|error| format!("failed to add zip entry: {error}"))?;
        zip.write_all(&entry.bytes)
            .map_err(|error| format!("failed to write zip entry: {error}"))?;
    }

    zip.finish()
        .map_err(|error| format!("failed to finalize zip file: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn open_devtools(window: WebviewWindow) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        window.open_devtools();
        return Ok(());
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        Err("Inspect is only available in debug builds".to_string())
    }
}
