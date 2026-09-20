use std::fs::File;
use std::io::Write;

use ergo_core::core_errors::ErgoError;
use tauri::ipc::{Request, Response};
use tauri::{State, WebviewWindow};

use crate::ipc::{blocking, decode_file_bundle, file_bundle_response, header_text, raw_body};

use crate::app_state::TauriAppState;
use crate::ast::DocumentAST;
use crate::ast::ProjectSettings;
use crate::font_availability::{
    check_project_font_availability, resolve_project_settings_fonts, ProjectFontAvailability,
};
use crate::font_loader::{list_system_font_family_names, load_font_bytes_for_families};
use crate::font_requirements::{families_missing_from_bundled, required_font_families};

/// Font files as a file bundle (paths are the font's index in the list).
fn font_bundle(fonts: Vec<Vec<u8>>) -> Response {
    let named: Vec<(String, Vec<u8>)> = fonts
        .into_iter()
        .enumerate()
        .map(|(index, bytes)| (index.to_string(), bytes))
        .collect();
    file_bundle_response(named.iter().map(|(name, bytes)| (name.as_str(), bytes.as_slice())))
}

#[tauri::command]
pub async fn load_fonts_for_families(families: Vec<String>) -> Result<Response, ErgoError> {
    blocking(move || {
        let missing = families_missing_from_bundled(
            &families
                .into_iter()
                .filter(|family| !family.trim().is_empty())
                .collect(),
        );
        Ok(font_bundle(load_font_bytes_for_families(&missing)?))
    })
    .await
}

#[tauri::command]
pub async fn list_system_font_families() -> Result<Vec<String>, ErgoError> {
    blocking(|| Ok(list_system_font_family_names())).await
}

#[tauri::command]
pub async fn load_fonts_for_document(ast: DocumentAST) -> Result<Response, ErgoError> {
    blocking(move || {
        let resolved = resolve_project_settings_fonts(&ast.metadata.project_settings);
        let mut resolved_ast = ast;
        resolved_ast.metadata.project_settings = resolved;
        let required = required_font_families(&resolved_ast);
        let missing = families_missing_from_bundled(&required);
        Ok(font_bundle(load_font_bytes_for_families(&missing)?))
    })
    .await
}

#[tauri::command]
pub async fn check_project_fonts(
    settings: ProjectSettings,
) -> Result<ProjectFontAvailability, ErgoError> {
    blocking(move || Ok(check_project_font_availability(&settings))).await
}

#[tauri::command]
pub async fn resolve_project_fonts(settings: ProjectSettings) -> Result<ProjectSettings, ErgoError> {
    blocking(move || Ok(resolve_project_settings_fonts(&settings))).await
}

#[tauri::command]
pub fn write_source(
    state: State<'_, TauriAppState>,
    path: String,
    text: String,
) -> Result<(), ErgoError> {
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
) -> Result<(), ErgoError> {
    state.vfs.apply_patch(&path, start, end, &text)?;
    Ok(())
}

/// Canonical BibLaTeX export content (same normalization as the compiled
/// in-VFS `references.bib`), so exported files parse wherever compiles do.
#[tauri::command]
pub fn generate_references_bib(
    references: Vec<ergo_core::ast::ReferenceEntry>,
) -> Result<String, ErgoError> {
    Ok(ergo_core::generate_references_bib(&references))
}

/// Raw request: body = file bytes, `x-ergo-path` header = destination path.
#[tauri::command]
pub async fn write_bytes_to_path(request: Request<'_>) -> Result<(), ErgoError> {
    let path = header_text(&request, "x-ergo-path")?;
    let bytes = raw_body(&request)?;
    blocking(move || write_bytes_to_path_impl(&path, &bytes)).await
}

fn write_bytes_to_path_impl(path: &str, bytes: &[u8]) -> Result<(), ErgoError> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| {
                ErgoError::Operation {
                    message: format!("failed to create export directory: {error}"),
                }
            })?;
        }
    }

    std::fs::write(path, bytes).map_err(|error| {
        ErgoError::Operation {
            message: format!("failed to write export file: {error}"),
        }
    })
}

pub struct ZipExportEntry {
    pub name: String,
    pub bytes: Vec<u8>,
}

/// Raw request: body = file bundle of zip entries, `x-ergo-path` header = zip path.
#[tauri::command]
pub async fn write_zip_export(request: Request<'_>) -> Result<(), ErgoError> {
    let path = header_text(&request, "x-ergo-path")?;
    let entries: Vec<ZipExportEntry> = decode_file_bundle(&raw_body(&request)?)?
        .into_iter()
        .map(|(name, bytes)| ZipExportEntry { name, bytes })
        .collect();
    blocking(move || write_zip_export_impl(&path, entries)).await
}

fn write_zip_export_impl(path: &str, entries: Vec<ZipExportEntry>) -> Result<(), ErgoError> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|error| {
                ErgoError::Operation {
                    message: format!("failed to create export directory: {error}"),
                }
            })?;
        }
    }

    let file = File::create(&path).map_err(|error| {
        ErgoError::Operation {
            message: format!("failed to create zip file: {error}"),
        }
    })?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    for entry in entries {
        zip.start_file(entry.name, options).map_err(|error| {
            ErgoError::Operation {
                message: format!("failed to add zip entry: {error}"),
            }
        })?;
        zip.write_all(&entry.bytes).map_err(|error| {
            ErgoError::Operation {
                message: format!("failed to write zip entry: {error}"),
            }
        })?;
    }

    zip.finish().map_err(|error| {
        ErgoError::Operation {
            message: format!("failed to finalize zip file: {error}"),
        }
    })?;
    Ok(())
}

#[tauri::command]
pub fn open_devtools(window: WebviewWindow) -> Result<(), ErgoError> {
    #[cfg(debug_assertions)]
    {
        window.open_devtools();
        return Ok(());
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        Err(ErgoError::Operation {
            message: "Inspect is only available in debug builds".to_string(),
        })
    }
}
