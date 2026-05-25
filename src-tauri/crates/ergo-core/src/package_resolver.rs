use std::collections::HashSet;
use std::path::{Path, PathBuf};

use typst::syntax::FileId;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackageRef {
    pub namespace: String,
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackageFile {
    pub path: String,
    pub bytes: Vec<u8>,
}

impl PackageRef {
    pub fn from_import(import: &str, version: &str) -> Result<Self, String> {
        let package = import.strip_prefix('@').unwrap_or(import);
        let (namespace, name) = package
            .split_once('/')
            .ok_or_else(|| format!("package import must be namespaced: {import}"))?;
        Ok(Self {
            namespace: namespace.to_string(),
            name: name.to_string(),
            version: version.to_string(),
        })
    }

    pub fn from_file_id(file_id: FileId) -> Option<Self> {
        let package = file_id.package()?;
        Some(Self {
            namespace: package.namespace.as_str().to_string(),
            name: package.name.as_str().to_string(),
            version: package.version.to_string(),
        })
    }
}

pub fn package_vfs_path(package: &PackageRef, rootless_path: impl AsRef<Path>) -> String {
    format!(
        "packages/{}/{}/{}/{}",
        package.namespace,
        package.name,
        package.version,
        rootless_path
            .as_ref()
            .to_string_lossy()
            .replace('\\', "/")
            .trim_start_matches('/')
    )
}

pub fn package_virtual_path_from_file_id(file_id: FileId) -> Option<String> {
    let package = PackageRef::from_file_id(file_id)?;
    Some(package_vfs_path(
        &package,
        file_id.vpath().as_rootless_path(),
    ))
}

pub fn package_roots() -> Vec<PathBuf> {
    package_roots_from_env(|key| std::env::var(key).ok())
}

pub fn package_roots_from_env(mut env: impl FnMut(&str) -> Option<String>) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut seen = HashSet::new();

    let mut push_root = |path: PathBuf| {
        if seen.insert(path.clone()) {
            roots.push(path);
        }
    };

    if let Some(local_app_data) = env("LOCALAPPDATA") {
        push_root(PathBuf::from(local_app_data).join("typst").join("packages"));
    }
    if let Some(app_data) = env("APPDATA") {
        push_root(PathBuf::from(app_data).join("typst").join("packages"));
    }
    if let Some(user_profile) = env("USERPROFILE") {
        let home = PathBuf::from(user_profile);
        push_root(
            home.join("AppData")
                .join("Local")
                .join("typst")
                .join("packages"),
        );
        push_root(
            home.join("AppData")
                .join("Roaming")
                .join("typst")
                .join("packages"),
        );
    }
    if let Some(cache_home) = env("XDG_CACHE_HOME") {
        push_root(PathBuf::from(cache_home).join("typst").join("packages"));
    }
    if let Some(data_home) = env("XDG_DATA_HOME") {
        push_root(PathBuf::from(data_home).join("typst").join("packages"));
    }
    if let Some(home) = env("HOME") {
        let home = PathBuf::from(home);
        push_root(home.join(".cache").join("typst").join("packages"));
        push_root(
            home.join(".local")
                .join("share")
                .join("typst")
                .join("packages"),
        );
    }

    roots
}

pub fn find_package_file_in_roots(
    package: &PackageRef,
    rootless_path: impl AsRef<Path>,
    roots: &[PathBuf],
) -> Option<PathBuf> {
    roots
        .iter()
        .map(|root| {
            root.join(&package.namespace)
                .join(&package.name)
                .join(&package.version)
                .join(rootless_path.as_ref())
        })
        .find(|path| path.exists())
}

pub fn find_package_file(file_id: FileId) -> Option<PathBuf> {
    let package = PackageRef::from_file_id(file_id)?;
    find_package_file_in_roots(
        &package,
        file_id.vpath().as_rootless_path(),
        &package_roots(),
    )
}

pub fn find_package_dir(package: &PackageRef) -> Option<PathBuf> {
    package_roots()
        .into_iter()
        .map(|root| {
            root.join(&package.namespace)
                .join(&package.name)
                .join(&package.version)
        })
        .find(|path| path.exists())
}

pub fn collect_package_files(package: &PackageRef) -> Result<Vec<PackageFile>, String> {
    let base_dir = find_package_dir(package).ok_or_else(|| {
        format!(
            "Template package directory not found for: {} (version {})",
            package.name, package.version
        )
    })?;
    let mut files = Vec::new();
    read_dir_recursive(package, &base_dir, &base_dir, &mut files)?;
    Ok(files)
}

fn read_dir_recursive(
    package: &PackageRef,
    base: &Path,
    current: &Path,
    files: &mut Vec<PackageFile>,
) -> Result<(), String> {
    if !current.is_dir() {
        return Ok(());
    }

    for entry in std::fs::read_dir(current).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            read_dir_recursive(package, base, &path, files)?;
            continue;
        }
        if !path.is_file() {
            continue;
        }

        let relative = path.strip_prefix(base).map_err(|error| error.to_string())?;
        files.push(PackageFile {
            path: package_vfs_path(package, relative),
            bytes: std::fs::read(&path).map_err(|error| error.to_string())?,
        });
    }

    Ok(())
}
