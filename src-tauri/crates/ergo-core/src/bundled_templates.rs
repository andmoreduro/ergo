//! Bundled Typst template packages (`typst_templates/`) and project embedding helpers.

use crate::template_spec::TemplateSpec;
use crate::vfs::VirtualFileSystem;

pub const TEMPLATE_SPEC_PATH: &str = ".ergproj/template_spec.json";

/// Path prefix for a path-imported template package (e.g. `/umb-apa/lib.typ` → `umb-apa`).
pub fn template_package_mount_prefix(spec: &TemplateSpec) -> Option<String> {
    let name = spec.typst.package.name.trim();
    if let Some(rest) = name.strip_prefix('/') {
        return rest.split('/').next().map(str::to_string);
    }
    None
}

pub fn bundled_mount_for_template_id(template_id: &str) -> Option<&'static str> {
    match template_id {
        "umb-apa" => Some("umb-apa"),
        "apa7" => Some("versatile-apa"),
        _ => None,
    }
}

/// App-shipped templates whose editor spec and Typst package track the binary.
pub fn has_bundled_template_spec(template_id: &str) -> bool {
    bundled_mount_for_template_id(template_id).is_some()
}

/// Whether a VFS path belongs to an embedded path-imported template package tree.
pub fn is_embedded_template_package_path(path: &str) -> bool {
    path.starts_with("umb-apa/") || path.starts_with("versatile-apa/")
}

/// Collect mount prefixes that should be packed into `.ergproj` archives.
pub fn embedded_template_mounts_for_vfs(vfs: &VirtualFileSystem) -> Vec<String> {
    let mut mounts = Vec::new();
    if let Ok(json) = vfs.read_source(TEMPLATE_SPEC_PATH) {
        if let Ok(spec) = serde_json::from_str::<TemplateSpec>(&json) {
            if let Some(mount) = template_package_mount_prefix(&spec) {
                mounts.push(mount);
            }
        }
    }
    for mount in ["umb-apa", "versatile-apa"] {
        if mounts.iter().any(|existing| existing == mount) {
            continue;
        }
        if vfs.read_source(&format!("{mount}/lib.typ")).is_ok() {
            mounts.push(mount.to_string());
        }
    }
    mounts
}

pub fn is_path_under_template_mount(path: &str, mounts: &[String]) -> bool {
    mounts
        .iter()
        .any(|mount| path.starts_with(&format!("{mount}/")))
}

#[cfg(not(target_arch = "wasm32"))]
mod embed {
    use include_dir::{include_dir, Dir, DirEntry};

    static UMB_APA_PACKAGE: Dir<'_> =
        include_dir!("$CARGO_MANIFEST_DIR/../../../typst_templates/umb-apa");
    static VERSATILE_APA_PACKAGE: Dir<'_> =
        include_dir!("$CARGO_MANIFEST_DIR/../../../typst_templates/versatile-apa");

    fn walk(entry: &DirEntry<'_>, mount: &str, out: &mut Vec<(String, Vec<u8>)>) {
        match entry {
            DirEntry::Dir(dir) => {
                for child in dir.entries() {
                    walk(child, mount, out);
                }
            }
            DirEntry::File(file) => {
                let rel = file.path().to_string_lossy().replace('\\', "/");
                if rel.starts_with("template/") {
                    return;
                }
                out.push((
                    format!("{mount}/{rel}"),
                    file.contents().to_vec(),
                ));
            }
        }
    }

    fn bundled_files(mount: &str, package: &Dir<'_>) -> Vec<(String, Vec<u8>)> {
        let mut files = Vec::new();
        for entry in package.entries() {
            walk(entry, mount, &mut files);
        }
        files
    }

    pub fn bundled_package_files(template_id: &str) -> Option<Vec<(String, Vec<u8>)>> {
        match template_id {
            "umb-apa" => Some(bundled_files("umb-apa", &UMB_APA_PACKAGE)),
            "apa7" => Some(bundled_files("versatile-apa", &VERSATILE_APA_PACKAGE)),
            _ => None,
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn write_package_file(vfs: &VirtualFileSystem, path: &str, bytes: &[u8]) {
    let is_text = path.ends_with(".typ")
        || path.ends_with(".json")
        || path.ends_with(".bib")
        || path.ends_with(".csl")
        || path.ends_with(".toml")
        || path.ends_with(".md");
    if is_text {
        if let Ok(text) = std::str::from_utf8(bytes) {
            vfs.write_source(path, text.to_owned());
            return;
        }
    }
    vfs.write_file(path, bytes.to_vec());
}

/// Copy the app-bundled Typst package into the VFS (overwriting any embedded snapshot).
///
/// Path-imported templates ship with the app binary; `main.typ` is generated from the
/// current template spec, so the VFS package must stay aligned with that spec.
#[cfg(not(target_arch = "wasm32"))]
pub fn sync_bundled_template_package(
    vfs: &VirtualFileSystem,
    template_id: &str,
    spec: &TemplateSpec,
) -> Result<(), String> {
    let mount = template_package_mount_prefix(spec)
        .or_else(|| bundled_mount_for_template_id(template_id).map(str::to_string));
    let Some(_mount) = mount else {
        return Ok(());
    };

    let files = embed::bundled_package_files(template_id).ok_or_else(|| {
        format!("no bundled Typst package files for template `{template_id}`")
    })?;
    for (path, bytes) in files {
        write_package_file(vfs, &path, &bytes);
    }
    Ok(())
}

/// WASM preview loads template packages through a separate path; the host VFS is not used.
#[cfg(target_arch = "wasm32")]
pub fn sync_bundled_template_package(
    _vfs: &VirtualFileSystem,
    _template_id: &str,
    _spec: &TemplateSpec,
) -> Result<(), String> {
    Ok(())
}

/// Refresh `.ergproj/template_spec.json` from the app-bundled template manifest.
#[cfg(not(target_arch = "wasm32"))]
pub fn sync_bundled_template_spec(
    vfs: &VirtualFileSystem,
    template_id: &str,
) -> Result<(), String> {
    if !has_bundled_template_spec(template_id) {
        return Ok(());
    }
    let spec = crate::template_spec::load_bundled_template(template_id)?;
    let json = serde_json::to_string_pretty(&spec)
        .map_err(|error| format!("failed to serialize template spec: {error}"))?;
    vfs.write_source(TEMPLATE_SPEC_PATH, json);
    Ok(())
}

#[cfg(target_arch = "wasm32")]
pub fn sync_bundled_template_spec(
    _vfs: &VirtualFileSystem,
    _template_id: &str,
) -> Result<(), String> {
    Ok(())
}

/// Backward-compatible alias used by call sites that only need the bundled tree present.
pub fn materialize_bundled_template_package_if_missing(
    vfs: &VirtualFileSystem,
    template_id: &str,
    spec: &TemplateSpec,
) -> Result<(), String> {
    sync_bundled_template_package(vfs, template_id, spec)
}

#[cfg(not(target_arch = "wasm32"))]
pub fn bundled_package_files_for_template(template_id: &str) -> Option<Vec<(String, Vec<u8>)>> {
    embed::bundled_package_files(template_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_bundled_template_package_overwrites_stale_embedded_tree() {
        let vfs = VirtualFileSystem::new();
        vfs.write_source(
            "umb-apa/lib.typ",
            "#let umb-outlines = none\n".to_string(),
        );
        let spec: TemplateSpec = serde_json::from_str(include_str!(
            "../../../resources/templates/umb-apa/template.json"
        ))
        .unwrap();
        sync_bundled_template_package(&vfs, "umb-apa", &spec).unwrap();
        let lib = vfs.read_source("umb-apa/lib.typ").unwrap();
        assert!(
            lib.contains("umb-outlines"),
            "bundled lib.typ should replace stale embedded copy"
        );
        assert!(
            vfs.read_source("umb-apa/utils/umb-outlines.typ").is_ok(),
            "bundled utils should be present after sync"
        );
    }

    #[test]
    fn sync_bundled_template_spec_refreshes_vfs_snapshot() {
        let vfs = VirtualFileSystem::new();
        vfs.write_source(
            TEMPLATE_SPEC_PATH,
            r#"{"metadata":{"id":"umb-apa","name":"Stale","version":"0"},"typst":{"package":{"name":"/umb-apa/lib.typ","version":""}},"editor":{}}"#
                .to_string(),
        );
        sync_bundled_template_spec(&vfs, "umb-apa").unwrap();
        let spec: TemplateSpec =
            serde_json::from_str(&vfs.read_source(TEMPLATE_SPEC_PATH).unwrap()).unwrap();
        assert_eq!(spec.metadata.name, "UMB's APA7");
    }

    #[test]
    fn path_import_mount_prefix_parses_umb_apa() {
        let spec: TemplateSpec = serde_json::from_str(include_str!(
            "../../../resources/templates/umb-apa/template.json"
        ))
        .unwrap();
        assert_eq!(
            template_package_mount_prefix(&spec).as_deref(),
            Some("umb-apa")
        );
    }
}
