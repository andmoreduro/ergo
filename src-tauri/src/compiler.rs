use tauri::{State, WebviewWindow};



use crate::app_state::TauriAppState;

use crate::ast::DocumentAST;

use crate::compilation_types::ExportFormat;

use crate::font_loader::load_font_bytes_for_families;

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

pub fn load_fonts_for_document(ast: DocumentAST) -> Result<Vec<Vec<u8>>, String> {

    let required = required_font_families(&ast);

    let missing = families_missing_from_bundled(&required);

    load_font_bytes_for_families(&missing)

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

