use tauri::{AppHandle, State};

use crate::app_state::TauriAppState;
use crate::compilation_types::ExportFormat;

#[tauri::command]
pub fn start_preview_watch(
    app: AppHandle,
    state: State<'_, TauriAppState>,
) -> Result<(), String> {
    state.typst_watch.ensure_running(
        app,
        state.document_session.clone(),
        state.preview_sync.clone(),
    );
    Ok(())
}

#[tauri::command]
pub fn stop_preview_watch(
    state: State<'_, TauriAppState>,
) -> Result<(), String> {
    state.typst_watch.stop();
    Ok(())
}

const COMMON_FONT_FILES: &[&str] = &[
    "arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf",
    "times.ttf", "timesbd.ttf", "timesi.ttf", "timesbi.ttf",
    "calibri.ttf", "calibrib.ttf", "calibrii.ttf", "calibriz.ttf",
    "segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf",
    "cambria.ttc", "cambriab.ttf", "cambriai.ttf", "cambriaz.ttf",
    "consola.ttf", "consolab.ttf", "consolai.ttf", "consolaz.ttf",
    "cour.ttf", "courbd.ttf", "couri.ttf", "courbi.ttf",
    "georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf",
    "tahoma.ttf", "tahomabd.ttf",
    "verdana.ttf", "verdanab.ttf", "verdanai.ttf", "verdanaz.ttf",
    "stxingkai.ttf", "simsun.ttc", "simhei.ttf", "msyh.ttc",
];

#[tauri::command]
pub fn load_system_fonts() -> Result<Vec<Vec<u8>>, String> {
    let fonts_dir = std::path::PathBuf::from("C:\\Windows\\Fonts");
    let mut font_buffers = Vec::new();
    
    if fonts_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(fonts_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    let filename_lower = filename.to_lowercase();
                    if COMMON_FONT_FILES.iter().any(|f| *f == filename_lower) {
                        if let Ok(bytes) = std::fs::read(&path) {
                            font_buffers.push(bytes);
                        }
                    }
                }
            }
        }
    }
    
    Ok(font_buffers)
}

#[tauri::command]
pub fn export_document(
    state: State<'_, TauriAppState>,
    format: ExportFormat,
    bytes: Vec<u8>,
    page_number: Option<usize>,
) -> Result<(), String> {
    let vfs = &state.vfs;
    match format {
        ExportFormat::Pdf => {
            let export_path = ".ergproj/exports/document.pdf";
            vfs.write_file(export_path, bytes.clone());
            if let Err(e) = std::fs::create_dir_all(".ergproj/exports") {
                return Err(format!("failed to create export directory: {e}"));
            }
            if let Err(e) = std::fs::write(export_path, &bytes) {
                return Err(format!("failed to write PDF file: {e}"));
            }
            Ok(())
        }
        ExportFormat::Png => {
            let page = page_number.unwrap_or(1);
            let export_dir = ".ergproj/exports/png";
            let path = format!("{}/page-{}.png", export_dir, page);
            vfs.write_file(&path, bytes.clone());
            if let Err(e) = std::fs::create_dir_all(export_dir) {
                return Err(format!("failed to create export directory: {e}"));
            }
            if let Err(e) = std::fs::write(&path, &bytes) {
                return Err(format!("failed to write PNG file: {e}"));
            }
            Ok(())
        }
        ExportFormat::Svg => {
            let page = page_number.unwrap_or(1);
            let export_dir = ".ergproj/exports/svg";
            let path = format!("{}/page-{}.svg", export_dir, page);
            vfs.write_file(&path, bytes.clone());
            if let Err(e) = std::fs::create_dir_all(export_dir) {
                return Err(format!("failed to create export directory: {e}"));
            }
            if let Err(e) = std::fs::write(&path, &bytes) {
                return Err(format!("failed to write SVG file: {e}"));
            }
            Ok(())
        }
    }
}

// Low-level VFS commands (kept for direct VFS manipulation)

#[tauri::command]
pub fn write_source(
    state: State<'_, TauriAppState>,
    path: String,
    text: String,
) -> Result<(), String> {
    state.vfs.write_source(&path, text);
    state.typst_watch.mark_vfs_changed();
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
    state.typst_watch.mark_vfs_changed();
    Ok(())
}
