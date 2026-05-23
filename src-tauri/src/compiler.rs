use tauri::{AppHandle, State};

use crate::app_state::TauriAppState;
use crate::compilation_types::{CompilationResult, CompilationStatus, ExportFormat};
use crate::compile_artifacts::{compile_document, render_svgs, write_svg_pages};
use crate::path_utils::file_id_for_virtual_path;
use crate::world::ErgoWorld;

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

#[tauri::command]
pub fn export_document(
    state: State<'_, TauriAppState>,
    format: ExportFormat,
) -> Result<CompilationResult, String> {
    let vfs = &state.vfs;
    let world = ErgoWorld::new(
        vfs.clone(),
        file_id_for_virtual_path("main.typ"),
    );
    let source_revision = vfs.latest_revision();

    match format {
        ExportFormat::Svg => {
            match compile_document(&world) {
                Ok(document) => {
                    let svgs = render_svgs(&document);
                    let export_dir = ".ergproj/exports/svg";
                    write_svg_pages(vfs, export_dir, &svgs);
                    Ok(CompilationResult {
                        source_revision,
                        status: CompilationStatus::Succeeded,
                        preview_pages: None,
                        export_path: Some(export_dir.to_string()),
                        diagnostics: Vec::new(),
                        outline: None,
                        resources: None,
                    })
                }
                Err(error) => Ok(CompilationResult {
                    source_revision,
                    status: CompilationStatus::Failed,
                    preview_pages: None,
                    export_path: None,
                    diagnostics: vec![error.to_string()],
                    outline: None,
                    resources: None,
                }),
            }
        }
        ExportFormat::Pdf => {
            match compile_document(&world) {
                Ok(document) => {
                    match typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default()) {
                        Ok(bytes) => {
                            let export_path = ".ergproj/exports/document.pdf";
                            vfs.write_file(export_path, bytes);
                            Ok(CompilationResult {
                                source_revision,
                                status: CompilationStatus::Succeeded,
                                preview_pages: None,
                                export_path: Some(export_path.to_string()),
                                diagnostics: Vec::new(),
                                outline: None,
                                resources: None,
                            })
                        }
                        Err(errors) => {
                            let diagnostics: Vec<String> = errors
                                .iter()
                                .map(|d| format!("{:?}: {}", d.severity, d.message))
                                .collect();
                            Ok(CompilationResult {
                                source_revision,
                                status: CompilationStatus::Failed,
                                preview_pages: None,
                                export_path: None,
                                diagnostics,
                                outline: None,
                                resources: None,
                            })
                        }
                    }
                }
                Err(error) => Ok(CompilationResult {
                    source_revision,
                    status: CompilationStatus::Failed,
                    preview_pages: None,
                    export_path: None,
                    diagnostics: vec![error.to_string()],
                    outline: None,
                    resources: None,
                }),
            }
        }
        ExportFormat::Png => {
            match compile_document(&world) {
                Ok(document) => {
                    let export_dir = ".ergproj/exports/png";
                    for (index, page) in document.pages.iter().enumerate() {
                        let pixmap = typst_render::render(page, 2.0);
                        match pixmap.encode_png() {
                            Ok(bytes) => {
                                vfs.write_file(
                                    &format!("{}/page-{}.png", export_dir, index + 1),
                                    bytes,
                                )
                            }
                            Err(error) => {
                                return Ok(CompilationResult {
                                    source_revision,
                                    status: CompilationStatus::Failed,
                                    preview_pages: None,
                                    export_path: None,
                                    diagnostics: vec![error.to_string()],
                                    outline: None,
                                    resources: None,
                                })
                            }
                        }
                    }
                    Ok(CompilationResult {
                        source_revision,
                        status: CompilationStatus::Succeeded,
                        preview_pages: None,
                        export_path: Some(export_dir.to_string()),
                        diagnostics: Vec::new(),
                        outline: None,
                        resources: None,
                    })
                }
                Err(error) => Ok(CompilationResult {
                    source_revision,
                    status: CompilationStatus::Failed,
                    preview_pages: None,
                    export_path: None,
                    diagnostics: vec![error.to_string()],
                    outline: None,
                    resources: None,
                }),
            }
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
