use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use tauri::State;

use ergo_core::bundled_templates::{
    bundled_package_files_for_template, embedded_template_mounts_for_vfs,
    is_path_under_template_mount,
};
use ergo_core::template_spec::load_bundled_template;

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

    let template_mounts = embedded_template_mounts_for_vfs(&state.vfs);
    let mut files = state
        .vfs
        .get_all_files()
        .into_iter()
        .filter(|(name, _)| should_pack_file(name, &template_mounts))
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

#[derive(serde::Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(serde::Serialize, ts_rs::TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct OpenProjectResult {
    pub ast: DocumentAST,
    pub files: Vec<ProjectFile>,
}

#[tauri::command]
pub fn open_project(
    state: State<'_, TauriAppState>,
    path: String,
) -> Result<OpenProjectResult, String> {
    let ast = open_project_from_path(&state, path)?;
    let files = project_files_for_worker_bootstrap(&state.vfs);
    Ok(OpenProjectResult { ast, files })
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
    let _status = state.document_session.sync_snapshot(ast.clone())?;

    Ok(ast)
}

fn project_files_for_worker_bootstrap(vfs: &crate::vfs::VirtualFileSystem) -> Vec<ProjectFile> {
    let template_mounts = embedded_template_mounts_for_vfs(vfs);
    let mut files = vfs
        .get_all_files()
        .into_iter()
        .filter(|(path, _)| should_pack_file(path, &template_mounts))
        .map(|(path, bytes)| ProjectFile { path, bytes })
        .collect::<Vec<_>>();
    files.sort_by(|left, right| left.path.cmp(&right.path));
    files
}

fn should_pack_file(path: &str, template_mounts: &[String]) -> bool {
    is_archive_metadata_file(path)
        || is_worker_bootstrap_file(path)
        || is_path_under_template_mount(path, template_mounts)
}

fn is_archive_metadata_file(path: &str) -> bool {
    matches!(
        path,
        ".ergproj/document_state.json"
            | ".ergproj/dependency_manifest.json"
            | ".ergproj/project_settings.json"
            | ".ergproj/template.json"
            | ".ergproj/template_spec.json"
            | ".ergproj/source_map.json"
            | ".ergproj/field_source_map.json"
    )
}

fn is_worker_bootstrap_file(path: &str) -> bool {
    path.starts_with("assets/") || path.starts_with("packages/")
}

fn mirror_project_files_to_vfs(state: &TauriAppState, files: &[ProjectFile]) {
    for file in files {
        state.vfs.write_file(&file.path, file.bytes.clone());
    }
}

#[tauri::command]
pub fn load_template_package_files(
    state: State<'_, TauriAppState>,
    template_id: String,
) -> Result<Vec<ProjectFile>, String> {
    use ergo_core::package_resolver::PackageRef;

    if let Some(files) = bundled_package_files_for_template(&template_id) {
        let project_files: Vec<ProjectFile> = files
            .into_iter()
            .map(|(path, bytes)| ProjectFile { path, bytes })
            .collect();
        mirror_project_files_to_vfs(&state, &project_files);
        return Ok(project_files);
    }

    let spec = load_bundled_template(&template_id)?;
    let package = PackageRef::from_import(&spec.typst.package.name, &spec.typst.package.version)?;
    let files = crate::package_download::collect_package_files_with_deps(&package)?;
    mirror_project_files_to_vfs(&state, &files);
    Ok(files)
}

#[tauri::command]
pub fn load_package_files(
    state: State<'_, TauriAppState>,
    name: String,
    version: String,
) -> Result<Vec<ProjectFile>, String> {
    use ergo_core::package_resolver::PackageRef;

    let package = PackageRef::from_import(&name, &version)?;
    let files = crate::package_download::collect_package_files_with_deps(&package)?;
    mirror_project_files_to_vfs(&state, &files);
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_session::DocumentSession;
    use crate::test_fixtures::basic_document_ast;
    use crate::vfs::VirtualFileSystem;
    use std::collections::HashSet;
    use std::fs;
    use std::sync::Arc;
    use uuid::Uuid;

    fn test_state() -> TauriAppState {
        let vfs = Arc::new(VirtualFileSystem::new());
        let document_session = Arc::new(DocumentSession::new(Arc::clone(&vfs)));

        TauriAppState {
            vfs,
            document_session,
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
            .vfs
            .write_source("resources.typ", "#pagebreak()".to_string());
        state
            .document_session
            .sync_snapshot(basic_document_ast("Proyecto con ñ", "Resumen."))
            .unwrap();
        let path = temp_project_path();

        save_project_to_path(&state, &path).unwrap();

        let names = zip_names(&path);
        fs::remove_file(&path).ok();

        assert!(!names.contains("main.typ"));
        assert!(!names.contains("lib.typ"));
        assert!(!names.contains("elements/heading-1.typ"));
        assert!(!names.contains("references.bib"));
        assert!(!names.contains("resources.typ"));
        assert!(names.contains(".ergproj/document_state.json"));
        assert!(names.contains(".ergproj/dependency_manifest.json"));
        assert!(names.contains(".ergproj/project_settings.json"));
        assert!(names.contains(".ergproj/template.json"));
        assert!(names.contains(".ergproj/template_spec.json"));
        assert!(names.contains(".ergproj/source_map.json"));
        assert!(names.contains(".ergproj/field_source_map.json"));
        assert!(!names.contains(".ergproj/preview/svg/page-1.svg"));
        assert!(!names.contains(".ergproj/exports/document.pdf"));
    }

    #[test]
    fn save_project_embeds_template_package_and_spec_snapshot() {
        let state = test_state();
        state
            .document_session
            .sync_snapshot(basic_document_ast("Proyecto con ñ", "Resumen."))
            .unwrap();
        let path = temp_project_path();

        save_project_to_path(&state, &path).unwrap();

        let names = zip_names(&path);
        fs::remove_file(&path).ok();

        assert!(names.contains("versatile-apa/lib.typ"));
        assert!(names.contains(".ergproj/template_spec.json"));
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
            .read_source("elements/heading-1.typ")
            .unwrap()
            .contains("Introducción"));
        assert!(state
            .vfs
            .read_source("main.typ")
            .unwrap()
            .contains("#include \"elements/heading-1.typ\""));
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
    fn open_project_returns_only_worker_bootstrap_files() {
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
        zip.start_file(".ergproj/source_map.json", options).unwrap();
        zip.write_all(b"[]").unwrap();
        zip.start_file("main.typ", options).unwrap();
        zip.write_all(b"= stale").unwrap();
        zip.start_file("lib.typ", options).unwrap();
        zip.write_all(b"#let stale = true").unwrap();
        zip.start_file("elements/heading-1.typ", options).unwrap();
        zip.write_all(b"= stale").unwrap();
        zip.start_file("references.bib", options).unwrap();
        zip.write_all(b"@book{stale}").unwrap();
        zip.start_file("resources.typ", options).unwrap();
        zip.write_all(b"#pagebreak()").unwrap();
        zip.start_file("assets/image.png", options).unwrap();
        zip.write_all(&[137, 80, 78, 71]).unwrap();
        zip.start_file("packages/preview/pkg/1.0.0/lib.typ", options)
            .unwrap();
        zip.write_all(b"#let package = true").unwrap();
        zip.finish().unwrap();

        open_project_from_path(&state, &path).unwrap();
        fs::remove_file(&path).ok();

        let bootstrap_paths = project_files_for_worker_bootstrap(&state.vfs)
            .into_iter()
            .map(|file| file.path)
            .collect::<HashSet<_>>();

        assert!(bootstrap_paths.contains("assets/image.png"));
        assert!(bootstrap_paths.contains("packages/preview/pkg/1.0.0/lib.typ"));
        assert!(bootstrap_paths.contains("versatile-apa/lib.typ"));
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
    fn bundled_umb_apa_includes_lib_and_csl_but_not_starter() {
        let files = bundled_package_files_for_template("umb-apa").expect("umb-apa package");
        let paths: HashSet<String> = files.into_iter().map(|(path, _)| path).collect();

        assert!(paths.contains("umb-apa/lib.typ"), "missing lib.typ: {paths:?}");
        assert!(
            paths.contains("umb-apa/assets/styles/apa.csl"),
            "missing bundled CSL: {paths:?}"
        );
        assert!(paths.iter().any(|path| path.starts_with("umb-apa/utils/")));
        assert!(!paths.iter().any(|path| path.starts_with("umb-apa/template/")));
    }

    #[test]
    fn bundled_versatile_apa_includes_lib_but_not_starter() {
        let files = bundled_package_files_for_template("apa7").expect("apa7 package");
        let paths: HashSet<String> = files.into_iter().map(|(path, _)| path).collect();

        assert!(paths.contains("versatile-apa/lib.typ"), "missing lib.typ: {paths:?}");
        assert!(paths.iter().any(|path| path.starts_with("versatile-apa/utils/")));
        assert!(!paths.iter().any(|path| path.starts_with("versatile-apa/template/")));
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
