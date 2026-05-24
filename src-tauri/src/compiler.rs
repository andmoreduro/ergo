use tauri::State;

use crate::app_state::TauriAppState;
use crate::compilation_types::ExportFormat;

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
    let mut font_buffers = Vec::new();

    let font_dirs: Vec<std::path::PathBuf> = {
        #[cfg(windows)]
        {
            vec![std::path::PathBuf::from(r"C:\Windows\Fonts")]
        }
        #[cfg(target_os = "macos")]
        {
            vec![
                std::path::PathBuf::from("/System/Library/Fonts"),
                std::path::PathBuf::from("/Library/Fonts"),
            ]
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            vec![
                std::path::PathBuf::from("/usr/share/fonts"),
                std::path::PathBuf::from("/usr/local/share/fonts"),
            ]
        }
        #[cfg(not(any(windows, target_os = "macos", unix)))]
        {
            vec![]
        }
    };

    for fonts_dir in font_dirs {
        if !fonts_dir.exists() {
            continue;
        }
        let entries = match std::fs::read_dir(&fonts_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(filename) = path.file_name().and_then(|f| f.to_str()) else {
                continue;
            };
            let filename_lower = filename.to_ascii_lowercase();
            if COMMON_FONT_FILES.iter().any(|f| *f == filename_lower) {
                if let Ok(bytes) = std::fs::read(&path) {
                    font_buffers.push(bytes);
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
            let path = format!("{export_dir}/page-{page}.png");
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
            let path = format!("{export_dir}/page-{page}.svg");
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
