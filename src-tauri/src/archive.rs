use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use tauri::State;

use crate::app_state::TauriAppState;
use crate::ast::DocumentAST;

#[tauri::command]
pub fn save_project(state: State<'_, TauriAppState>, path: String) -> Result<(), String> {
    save_project_to_path(&state, &path)
}

pub fn save_project_to_path(state: &TauriAppState, path: impl AsRef<Path>) -> Result<(), String> {
    state
        .vfs
        .read_source(".ergproj/document_state.json")
        .map_err(|_| "No active document session to save".to_string())?;

    let mut files = state
        .vfs
        .get_all_files()
        .into_iter()
        .filter(|(name, _)| should_pack_file(name))
        .collect::<Vec<_>>();
    files.sort_by(|(left, _), (right, _)| left.cmp(right));

    let file = File::create(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for (name, content) in files {
        zip.start_file(name, options).map_err(|e| e.to_string())?;
        zip.write_all(&content).map_err(|e| e.to_string())?;
    }

    zip.finish().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn open_project(state: State<'_, TauriAppState>, path: String) -> Result<DocumentAST, String> {
    open_project_from_path(&state, path)
}

pub fn open_project_from_path(
    state: &TauriAppState,
    path: impl AsRef<Path>,
) -> Result<DocumentAST, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    state.vfs.clear();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if file.is_file() {
            let mut content = Vec::new();
            file.read_to_end(&mut content).map_err(|e| e.to_string())?;
            let is_text =
                name.ends_with(".typ") || name.ends_with(".json") || name.ends_with(".bib");
            if is_text {
                match std::str::from_utf8(&content) {
                    Ok(text) => {
                        state.vfs.write_source(&name, text.to_owned());
                    }
                    Err(_) => state.vfs.write_file(&name, content),
                }
            } else {
                state.vfs.write_file(&name, content);
            }
        }
    }

    let json_ast = state
        .vfs
        .read_source(".ergproj/document_state.json")
        .map_err(|_| ".ergproj/document_state.json is required".to_string())?;
    let ast: DocumentAST = serde_json::from_str(&json_ast).map_err(|e| e.to_string())?;
    let status = state.document_session.sync_snapshot(ast.clone())?;
    state
        .compilation_queue
        .mark_source_revision(status.source_revision);

    Ok(ast)
}

fn should_pack_file(path: &str) -> bool {
    !path.starts_with(".ergproj/preview/")
        && !path.starts_with(".ergproj/exports/")
        && !path.starts_with(".ergproj/resource-previews/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compilation_queue::CompilationQueue;
    use crate::document_session::DocumentSession;
    use crate::preview_sync::PreviewSyncState;
    use crate::test_fixtures::basic_document_ast;
    use crate::vfs::VirtualFileSystem;
    use std::collections::HashSet;
    use std::fs;
    use std::sync::Arc;
    use uuid::Uuid;

    fn test_state() -> TauriAppState {
        let vfs = Arc::new(VirtualFileSystem::new());
        let compilation_queue = Arc::new(CompilationQueue::new());
        let document_session = Arc::new(DocumentSession::new(Arc::clone(&vfs)));

        TauriAppState {
            vfs,
            compilation_queue,
            document_session,
            preview_sync: Arc::new(PreviewSyncState::default()),
        }
    }

    fn temp_project_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("ergo-test-{}.ergproj", Uuid::new_v4()))
    }

    fn zip_names(path: &Path) -> HashSet<String> {
        let file = File::open(path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        (0..archive.len())
            .map(|index| archive.by_index(index).unwrap().name().to_string())
            .collect()
    }

    #[test]
    fn save_project_writes_canonical_ergproj_layout_without_cache_artifacts() {
        let state = test_state();
        state
            .vfs
            .write_source(".ergproj/preview/svg/page-1.svg", "<svg />".to_string());
        state
            .vfs
            .write_file(".ergproj/exports/document.pdf", vec![1, 2, 3]);
        state
            .document_session
            .sync_snapshot(basic_document_ast("Proyecto con ñ", "Resumen."))
            .unwrap();
        let path = temp_project_path();

        save_project_to_path(&state, &path).unwrap();

        let names = zip_names(&path);
        fs::remove_file(&path).ok();

        assert!(names.contains("main.typ"));
        assert!(names.contains("sections/content-section.typ"));

        assert!(names.contains("references.bib"));
        assert!(names.contains(".ergproj/document_state.json"));
        assert!(names.contains(".ergproj/dependency_manifest.json"));
        assert!(names.contains(".ergproj/project_settings.json"));
        assert!(names.contains(".ergproj/template.json"));
        assert!(names.contains(".ergproj/source_map.json"));
        assert!(names.contains(".ergproj/field_source_map.json"));
        assert!(!names.contains(".ergproj/preview/svg/page-1.svg"));
        assert!(!names.contains(".ergproj/exports/document.pdf"));
    }

    #[test]
    fn save_project_uses_backend_session_state_after_events() {
        let state = test_state();
        state
            .document_session
            .sync_snapshot(basic_document_ast("Proyecto con ñ", "Resumen."))
            .unwrap();
        state
            .document_session
            .apply_event(crate::document_session::DocumentEvent::SetProjectTitle {
                title: "Guardado incremental".to_string(),
            })
            .unwrap();
        let path = temp_project_path();

        save_project_to_path(&state, &path).unwrap();

        let file = File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut document_state = String::new();
        archive
            .by_name(".ergproj/document_state.json")
            .unwrap()
            .read_to_string(&mut document_state)
            .unwrap();
        fs::remove_file(&path).ok();

        assert!(document_state.contains("Guardado incremental"));
    }

    #[test]
    fn open_project_materializes_section_files_from_document_state() {
        let state = test_state();
        let path = temp_project_path();
        let file = File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file(".ergproj/document_state.json", options)
            .unwrap();
        zip.write_all(
            serde_json::to_string(&basic_document_ast("Proyecto con ñ", "Resumen."))
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
        zip.start_file("main.typ", options).unwrap();
        zip.write_all(b"= Unused source").unwrap();
        zip.finish().unwrap();

        let ast = open_project_from_path(&state, &path).unwrap();
        fs::remove_file(&path).ok();

        assert_eq!(ast.metadata.title, "Proyecto con ñ");
        assert!(state
            .vfs
            .read_source("sections/content-section.typ")
            .unwrap()
            .contains("Introducción"));
        assert!(state
            .vfs
            .read_source("main.typ")
            .unwrap()
            .contains("#include \"sections/content-section.typ\""));
    }

    #[test]
    fn open_project_mounts_binary_assets() {
        let state = test_state();
        let path = temp_project_path();
        let file = File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file(".ergproj/document_state.json", options)
            .unwrap();
        zip.write_all(
            serde_json::to_string(&basic_document_ast("Proyecto con ñ", "Resumen."))
                .unwrap()
                .as_bytes(),
        )
        .unwrap();
        zip.start_file("assets/image.png", options).unwrap();
        zip.write_all(&[137, 80, 78, 71]).unwrap();
        zip.finish().unwrap();

        open_project_from_path(&state, &path).unwrap();
        fs::remove_file(&path).ok();

        assert_eq!(
            state.vfs.read_file("assets/image.png").unwrap(),
            vec![137, 80, 78, 71]
        );
    }

    #[test]
    fn save_project_excludes_resource_preview_cache() {
        let state = test_state();
        let path = temp_project_path();
        state
            .document_session
            .sync_snapshot(basic_document_ast("Title", "Abstract"))
            .unwrap();
        state.vfs.write_file(
            ".ergproj/resource-previews/svg/equation-1-deadbeef.svg",
            b"<svg />".to_vec(),
        );
        state
            .vfs
            .write_file("assets/image.png", vec![137, 80, 78, 71]);

        save_project_to_path(&state, &path).unwrap();

        let file = File::open(&path).unwrap();
        let mut zip = zip::ZipArchive::new(file).unwrap();
        let names: HashSet<String> = (0..zip.len())
            .map(|index| zip.by_index(index).unwrap().name().to_string())
            .collect();
        fs::remove_file(&path).ok();

        assert!(!names.contains(".ergproj/resource-previews/svg/equation-1-deadbeef.svg"));
        assert!(names.contains("assets/image.png"));
    }

    #[test]
    fn open_project_requires_document_state() {
        let state = test_state();
        let path = temp_project_path();
        let file = File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("main.typ", options).unwrap();
        zip.write_all(b"= Raw Typst").unwrap();
        zip.finish().unwrap();

        let error = open_project_from_path(&state, &path).unwrap_err();
        fs::remove_file(&path).ok();

        assert!(error.contains(".ergproj/document_state.json"));
        assert_eq!(error, ".ergproj/document_state.json is required");
    }
}
