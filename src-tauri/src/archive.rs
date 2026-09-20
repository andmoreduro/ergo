use std::sync::Arc;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::State;

use ergo_core::bundled_templates::{
    bundled_package_files_for_template, embedded_template_mounts_for_vfs,
    is_path_under_template_mount,
};
use ergo_core::core_errors::ErgoError;
use ergo_core::path_utils::normalize_virtual_path;
use ergo_core::template_spec::load_bundled_template;

use crate::app_state::TauriAppState;
use crate::ast::DocumentAST;

const DOCUMENT_STATE_PATH: &str = ".ergproj/document_state.json";

#[tauri::command]
pub async fn save_project(state: State<'_, TauriAppState>, path: String) -> Result<(), ErgoError> {
    let app_state = state.inner().clone();
    crate::ipc::blocking(move || save_project_to_path(&app_state, &path)).await
}

pub fn save_project_to_path(state: &TauriAppState, path: impl AsRef<Path>) -> Result<(), ErgoError> {
    state
        .vfs
        .read_source(".ergproj/document_state.json")
        .map_err(|_| {
            ErgoError::Operation {
                message: "No active document session to save".to_string(),
            }
        })?;

    let template_mounts = embedded_template_mounts_for_vfs(&state.vfs);
    let mut files = state
        .vfs
        .get_all_files()
        .into_iter()
        .filter(|(name, _)| should_pack_file(name, &template_mounts))
        .collect::<Vec<_>>();
    files.sort_by(|(left, _), (right, _)| left.cmp(right));

    // Atomic save: write the archive to a sibling temp file, fsync, then rename
    // over the target. File::create truncates the destination before writing, so
    // a crash or kill mid-save (e.g. during the fire-and-forget autosave
    // interval) would leave a truncated archive with no End-of-Central-Directory
    // record ("Could not find EOCD" on reopen). Writing to a temp file first
    // guarantees the destination is either the previous complete archive or the
    // new one — never a partial write.
    let target = path.as_ref();
    let temp_path = temp_path_for(target);
    if let Err(err) = write_archive(&temp_path, &files) {
        // Clean up the partial temp file so it doesn't confuse a later save.
        let _ = std::fs::remove_file(&temp_path);
        return Err(err);
    }

    // fsync the temp file's directory so the rename survives a crash.
    if let Some(parent) = temp_path.parent() {
        let _ = std::fs::File::open(parent).and_then(|dir| dir.sync_all());
    }

    std::fs::rename(&temp_path, target).map_err(|e| {
        ErgoError::Operation {
            message: format!("Failed to finalize save (rename): {e}"),
        }
    })?;

    Ok(())
}

/// Build a sibling temp path (e.g. `project.ergproj` → `project.ergproj.tmp`).
fn temp_path_for(path: &Path) -> PathBuf {
    let mut tmp = path.to_path_buf();
    let extension = tmp.extension().map(|ext| {
        let mut owned = ext.to_owned();
        owned.push(".tmp");
        owned
    });
    match extension {
        Some(ext) => tmp.set_extension(ext),
        None => tmp.set_extension("tmp"),
    };
    tmp
}

fn write_archive(temp_path: &Path, files: &[(String, Vec<u8>)]) -> Result<File, ErgoError> {
    let file =
        File::create(temp_path).map_err(|e| ErgoError::Operation { message: e.to_string() })?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    for (name, content) in files {
        zip.start_file(name, options)
            .map_err(|e| ErgoError::Operation { message: e.to_string() })?;
        zip.write_all(content)
            .map_err(|e| ErgoError::Operation { message: e.to_string() })?;
    }

    zip.finish().map_err(|e| ErgoError::Operation { message: e.to_string() })
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
}

/// Opens an archive into the backend session. The files the WASM worker needs
/// to bootstrap follow through `read_worker_bootstrap_files` as a raw bundle.
#[tauri::command]
pub async fn open_project(
    state: State<'_, TauriAppState>,
    path: String,
) -> Result<OpenProjectResult, ErgoError> {
    let app_state = state.inner().clone();
    crate::ipc::blocking(move || {
        let ast = open_project_from_path(&app_state, path)?;
        Ok(OpenProjectResult { ast })
    })
    .await
}

/// The current backend VFS files the worker bootstrap needs, as a file bundle.
#[tauri::command]
pub async fn read_worker_bootstrap_files(
    state: State<'_, TauriAppState>,
) -> Result<tauri::ipc::Response, ErgoError> {
    let vfs = Arc::clone(&state.vfs);
    crate::ipc::blocking(move || {
        let files = project_files_for_worker_bootstrap(&vfs);
        Ok(crate::ipc::file_bundle_response(
            files.iter().map(|file| (file.path.as_str(), file.bytes.as_slice())),
        ))
    })
    .await
}

pub fn open_project_from_path(
    state: &TauriAppState,
    path: impl AsRef<Path>,
) -> Result<DocumentAST, ErgoError> {
    // Read and validate everything that can fail before touching the VFS, so a
    // rejected archive leaves the currently open project (assets included)
    // exactly as it was; otherwise its next autosave would pack an empty tree.
    let entries = read_archive_entries(path)?;
    let ast = document_state_from_entries(&entries)?;

    let previous = state.vfs.snapshot();
    state.vfs.clear();
    for entry in entries {
        match entry.content {
            ArchiveContent::Text(text) => {
                state.vfs.write_source(&entry.path, text);
            }
            ArchiveContent::Binary(bytes) => state.vfs.write_file(&entry.path, bytes),
        }
    }
    if let Err(error) = state.document_session.sync_snapshot(ast.clone()) {
        state.vfs.restore(previous);
        return Err(error);
    }

    Ok(ast)
}

struct ArchiveEntry {
    path: String,
    content: ArchiveContent,
}

enum ArchiveContent {
    Text(String),
    Binary(Vec<u8>),
}

fn read_archive_entries(path: impl AsRef<Path>) -> Result<Vec<ArchiveEntry>, ErgoError> {
    let file = File::open(path).map_err(|e| ErgoError::Operation { message: e.to_string() })?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| ErgoError::Operation { message: e.to_string() })?;

    let mut entries = Vec::with_capacity(archive.len());
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| ErgoError::Operation { message: e.to_string() })?;
        if !file.is_file() {
            continue;
        }
        let path = file.name().to_string();
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|e| ErgoError::Operation { message: e.to_string() })?;
        let is_text =
            path.ends_with(".typ") || path.ends_with(".json") || path.ends_with(".bib");
        let content = if is_text {
            match String::from_utf8(bytes) {
                Ok(text) => ArchiveContent::Text(text),
                Err(error) => ArchiveContent::Binary(error.into_bytes()),
            }
        } else {
            ArchiveContent::Binary(bytes)
        };
        entries.push(ArchiveEntry { path, content });
    }
    Ok(entries)
}

fn document_state_from_entries(entries: &[ArchiveEntry]) -> Result<DocumentAST, ErgoError> {
    let json = entries
        .iter()
        .find(|entry| normalize_virtual_path(&entry.path) == DOCUMENT_STATE_PATH)
        .and_then(|entry| match &entry.content {
            ArchiveContent::Text(text) => Some(text),
            ArchiveContent::Binary(_) => None,
        })
        .ok_or(ErgoError::DocumentStateRequired)?;
    serde_json::from_str(json).map_err(|e| ErgoError::Operation { message: e.to_string() })
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

fn project_files_bundle(files: &[ProjectFile]) -> tauri::ipc::Response {
    crate::ipc::file_bundle_response(
        files.iter().map(|file| (file.path.as_str(), file.bytes.as_slice())),
    )
}

fn template_package_files(
    state: &TauriAppState,
    template_id: &str,
) -> Result<Vec<ProjectFile>, ErgoError> {
    use ergo_core::package_resolver::PackageRef;

    if let Some(files) = bundled_package_files_for_template(template_id) {
        let project_files: Vec<ProjectFile> = files
            .into_iter()
            .map(|(path, bytes)| ProjectFile { path, bytes })
            .collect();
        mirror_project_files_to_vfs(state, &project_files);
        return Ok(project_files);
    }

    let spec = load_bundled_template(template_id)?;
    let package = PackageRef::from_import(&spec.typst.package.name, &spec.typst.package.version)?;
    let files = crate::package_download::collect_package_files_with_deps(&package)?;
    mirror_project_files_to_vfs(state, &files);
    Ok(files)
}

/// Template Typst package files as a file bundle (also mirrored into the backend VFS).
#[tauri::command]
pub async fn load_template_package_files(
    state: State<'_, TauriAppState>,
    template_id: String,
) -> Result<tauri::ipc::Response, ErgoError> {
    let app_state = state.inner().clone();
    crate::ipc::blocking(move || {
        Ok(project_files_bundle(&template_package_files(&app_state, &template_id)?))
    })
    .await
}

/// A registry package's files (with dependencies) as a file bundle.
#[tauri::command]
pub async fn load_package_files(
    state: State<'_, TauriAppState>,
    name: String,
    version: String,
) -> Result<tauri::ipc::Response, ErgoError> {
    use ergo_core::package_resolver::PackageRef;

    let app_state = state.inner().clone();
    crate::ipc::blocking(move || {
        let package = PackageRef::from_import(&name, &version)?;
        let files = crate::package_download::collect_package_files_with_deps(&package)?;
        mirror_project_files_to_vfs(&app_state, &files);
        Ok(project_files_bundle(&files))
    })
    .await
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
    fn bundled_packages_include_lib_but_not_starter() {
        // (template id, embedded package dir, extra expected file)
        for (template_id, package_dir, extra) in [
            ("umb-apa", "umb-apa", "umb-apa/assets/styles/apa.csl"),
            ("apa7", "versatile-apa", "versatile-apa/typst.toml"),
        ] {
            let files =
                bundled_package_files_for_template(template_id).expect("bundled package");
            let paths: HashSet<String> = files.into_iter().map(|(path, _)| path).collect();

            assert!(
                paths.contains(&format!("{package_dir}/lib.typ")),
                "{template_id} missing lib.typ: {paths:?}"
            );
            assert!(
                paths.contains(extra),
                "{template_id} missing {extra}: {paths:?}"
            );
            assert!(
                !paths.iter().any(|path| path.starts_with(&format!(
                    "{package_dir}/template/"
                ))),
                "{template_id} must not embed the starter template dir"
            );
        }
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

        assert!(error.to_string().contains(".ergproj/document_state.json"));
        assert_eq!(error.to_string(), ".ergproj/document_state.json is required");
    }

    #[test]
    fn open_project_rejects_corrupt_archive_bytes() {
        let state = test_state();
        let path = temp_project_path();
        // Not a zip at all: truncated header garbage of the same length as a
        // real EOCD scan window.
        fs::write(&path, b"this is definitely not a zip archive").unwrap();

        let error = open_project_from_path(&state, &path).unwrap_err();
        fs::remove_file(&path).ok();

        assert!(
            !error.to_string().is_empty(),
            "corrupt archive must surface an error, not panic or hang"
        );
    }

    #[test]
    fn rejected_archive_leaves_the_open_project_vfs_intact() {
        // Regression guard: a failed open used to clear the VFS before
        // validating the archive, so the still-open project silently lost
        // every asset and its next autosave packed an archive without images.
        fn write_archive(build: impl Fn(&mut zip::ZipWriter<File>)) -> PathBuf {
            let path = temp_project_path();
            let mut zip = zip::ZipWriter::new(File::create(&path).unwrap());
            build(&mut zip);
            zip.finish().unwrap();
            path
        }
        let options = zip::write::SimpleFileOptions::default();

        // Failures before and after the VFS is repopulated must both roll back.
        let invalid_archives = [
            (
                "missing document state",
                write_archive(|zip| {
                    zip.start_file("main.typ", options).unwrap();
                    zip.write_all(b"= Raw Typst").unwrap();
                }),
            ),
            (
                "malformed document state",
                write_archive(|zip| {
                    zip.start_file(".ergproj/document_state.json", options)
                        .unwrap();
                    zip.write_all(b"{ not json").unwrap();
                }),
            ),
            (
                "unknown template without an embedded spec (fails during sync)",
                write_archive(|zip| {
                    let mut ast = basic_document_ast("Otro", "");
                    ast.metadata.template_id = "missing-template".to_string();
                    zip.start_file(".ergproj/document_state.json", options)
                        .unwrap();
                    zip.write_all(serde_json::to_string(&ast).unwrap().as_bytes())
                        .unwrap();
                }),
            ),
        ];

        for (case, archive_path) in invalid_archives {
            let state = test_state();
            state
                .document_session
                .sync_snapshot(basic_document_ast("Abierto", ""))
                .unwrap();
            state
                .vfs
                .write_file("assets/image.png", vec![137, 80, 78, 71]);
            let before = state.vfs.get_all_files();

            let result = open_project_from_path(&state, &archive_path);
            fs::remove_file(&archive_path).ok();

            assert!(result.is_err(), "{case}: open must fail");
            assert_eq!(
                state.vfs.get_all_files(),
                before,
                "{case}: VFS must be exactly as before the failed open"
            );

            // The still-open project keeps packing its assets on the next save.
            let save_path = temp_project_path();
            save_project_to_path(&state, &save_path).unwrap();
            let names = zip_names(&save_path);
            fs::remove_file(&save_path).ok();
            assert!(
                names.contains("assets/image.png"),
                "{case}: save after a failed open lost the assets"
            );
        }
    }

    #[test]
    fn save_leaves_no_temp_file_and_replaces_previous_archive() {
        // Regression guard for the atomic-save fix: a second save must replace
        // the prior complete archive (not truncate it mid-write) and must not
        // leave a stale .tmp sibling. A kill during the old File::create path
        // left a truncated archive ("Could not find EOCD" on reopen).
        let state = test_state();
        state
            .document_session
            .sync_snapshot(basic_document_ast("First", ""))
            .unwrap();
        let path = temp_project_path();

        // First save establishes a valid archive.
        save_project_to_path(&state, &path).unwrap();
        let first_names = zip_names(&path);

        // Second save with different content replaces it atomically.
        state
            .document_session
            .sync_snapshot(basic_document_ast("Second", ""))
            .unwrap();
        save_project_to_path(&state, &path).unwrap();
        let second_names = zip_names(&path);

        // Both archives must be readable (valid EOCD) and contain the document.
        assert!(first_names.contains(".ergproj/document_state.json"));
        assert_eq!(first_names, second_names);

        // No stale temp file left behind.
        let temp_path = temp_path_for(&path);
        assert!(!temp_path.exists(), "temp file should be renamed away");

        fs::remove_file(&path).ok();
    }
}
