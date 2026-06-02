//! On-demand Typst package fetching.
//!
//! The in-browser (WASM) preview compiler cannot reach the network, so every
//! package it needs must be present in the local Typst cache and mirrored into
//! its VFS before compiling. Historically that worked only because the host
//! cache happened to be populated (e.g. by a prior `typst` CLI run). This module
//! removes that hidden dependency: when a package is missing from the cache it is
//! downloaded from the Typst preview registry, and its transitive `@preview`
//! imports are resolved the same way, so a fresh machine can render LaTeX
//! equations (mitex) and template packages out of the box.

use std::collections::HashSet;
use std::path::PathBuf;

use ergo_core::package_resolver::{
    collect_package_files, find_package_dir, package_roots, PackageFile, PackageRef,
};

use crate::archive::ProjectFile;

const REGISTRY_BASE: &str = "https://packages.typst.org";

/// Ensure `root` and every `@preview` package it transitively imports are present
/// in the local Typst cache (downloading any that are missing), then return all
/// of their files ready to be mirrored into the preview VFS.
pub fn collect_package_files_with_deps(root: &PackageRef) -> Result<Vec<ProjectFile>, String> {
    let mut visited: HashSet<(String, String, String)> = HashSet::new();
    let mut queue: Vec<PackageRef> = vec![root.clone()];
    let mut out: Vec<ProjectFile> = Vec::new();

    while let Some(package) = queue.pop() {
        let key = (
            package.namespace.clone(),
            package.name.clone(),
            package.version.clone(),
        );
        if !visited.insert(key) {
            continue;
        }

        ensure_package(&package)?;
        let files = collect_package_files(&package)?;

        for dep in scan_preview_deps(&files) {
            let dep_key = (
                dep.namespace.clone(),
                dep.name.clone(),
                dep.version.clone(),
            );
            if !visited.contains(&dep_key) {
                queue.push(dep);
            }
        }

        out.extend(files.into_iter().map(|file| ProjectFile {
            path: file.path,
            bytes: file.bytes,
        }));
    }

    Ok(out)
}

/// Download `package` into the cache if it is not already there. Only `@preview`
/// packages can be fetched; any other namespace must be pre-installed.
pub fn ensure_package(package: &PackageRef) -> Result<(), String> {
    if find_package_dir(package).is_some() {
        return Ok(());
    }
    if package.namespace != "preview" {
        return Err(format!(
            "Package @{}/{}:{} is not installed and only @preview packages can be downloaded automatically",
            package.namespace, package.name, package.version
        ));
    }
    download_and_extract(package)
}

fn cache_target_dir(package: &PackageRef) -> Result<PathBuf, String> {
    let root = package_roots()
        .into_iter()
        .next()
        .ok_or_else(|| "No Typst package cache directory is available".to_string())?;
    Ok(root
        .join(&package.namespace)
        .join(&package.name)
        .join(&package.version))
}

fn download_and_extract(package: &PackageRef) -> Result<(), String> {
    let url = format!(
        "{REGISTRY_BASE}/{}/{}-{}.tar.gz",
        package.namespace, package.name, package.version
    );
    let bytes = fetch_tarball(&url)?;
    let target = cache_target_dir(package)?;
    install_tarball(&bytes, &target, &package.name, &package.version)
}

fn fetch_tarball(url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::blocking::get(url)
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("Failed to download {url}: {error}"))?;
    response
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| format!("Failed to read {url}: {error}"))
}

/// Typst registry tarballs hold the package files at the archive root
/// (`typst.toml` at top level), so they unpack directly into the version
/// directory. Extraction goes through a sibling temp dir that is atomically
/// renamed into place, so a failed or concurrent download never leaves a
/// half-populated package behind.
fn install_tarball(
    bytes: &[u8],
    target: &std::path::Path,
    name: &str,
    version: &str,
) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "Invalid package cache path".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let staging = parent.join(format!(".{version}-{}.tmp", uuid::Uuid::new_v4()));
    let decoder = flate2::read::GzDecoder::new(bytes);
    let mut archive = tar::Archive::new(decoder);
    if let Err(error) = archive.unpack(&staging) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(format!("Failed to extract {name}: {error}"));
    }

    if target.exists() {
        // Another writer won the race; keep theirs and discard ours.
        let _ = std::fs::remove_dir_all(&staging);
        return Ok(());
    }
    std::fs::rename(&staging, target).map_err(|error| {
        let _ = std::fs::remove_dir_all(&staging);
        format!("Failed to install {name}: {error}")
    })?;
    Ok(())
}

/// `@preview` packages imported by a package's compiled sources. Example, test,
/// and documentation directories are skipped so the closure stays to packages
/// the code actually depends on rather than everything mentioned in samples.
fn scan_preview_deps(files: &[PackageFile]) -> Vec<PackageRef> {
    let mut deps: Vec<PackageRef> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for file in files {
        if !file.path.ends_with(".typ") || is_noncompiled_path(&file.path) {
            continue;
        }
        let Ok(text) = std::str::from_utf8(&file.bytes) else {
            continue;
        };
        for package in scan_imports(text) {
            let key = format!("{}/{}:{}", package.namespace, package.name, package.version);
            if seen.insert(key) {
                deps.push(package);
            }
        }
    }

    deps
}

fn is_noncompiled_path(path: &str) -> bool {
    const SKIP: [&str; 7] = [
        "/examples/",
        "/example/",
        "/tests/",
        "/test/",
        "/gallery/",
        "/manual/",
        "/docs/",
    ];
    SKIP.iter().any(|segment| path.contains(segment))
}

/// Find every `@namespace/name:x.y.z` package spec in `text`.
fn scan_imports(text: &str) -> Vec<PackageRef> {
    let mut found = Vec::new();
    let bytes = text.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte != b'@' {
            continue;
        }
        if let Some(package) = parse_package_spec(&text[index + 1..]) {
            found.push(package);
        }
    }
    found
}

fn parse_package_spec(input: &str) -> Option<PackageRef> {
    let (namespace, rest) = take_ident(input)?;
    let rest = rest.strip_prefix('/')?;
    let (name, rest) = take_ident(rest)?;
    let rest = rest.strip_prefix(':')?;
    let version = take_version(rest)?;
    Some(PackageRef {
        namespace,
        name,
        version,
    })
}

fn take_ident(input: &str) -> Option<(String, &str)> {
    let end = input
        .char_indices()
        .find(|(_, ch)| !(ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_'))
        .map(|(index, _)| index)
        .unwrap_or(input.len());
    if end == 0 {
        return None;
    }
    Some((input[..end].to_string(), &input[end..]))
}

fn take_version(input: &str) -> Option<String> {
    let end = input
        .char_indices()
        .find(|(_, ch)| !(ch.is_ascii_digit() || *ch == '.'))
        .map(|(index, _)| index)
        .unwrap_or(input.len());
    let version = &input[..end];
    let parts: Vec<&str> = version.split('.').collect();
    if parts.len() == 3 && parts.iter().all(|part| !part.is_empty()) {
        Some(version.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_well_formed_package_spec() {
        let spec = parse_package_spec("preview/mitex:0.2.7\": mi, mitex").unwrap();
        assert_eq!(spec.namespace, "preview");
        assert_eq!(spec.name, "mitex");
        assert_eq!(spec.version, "0.2.7");
    }

    #[test]
    fn rejects_non_version_suffix() {
        assert!(parse_package_spec("preview/mitex:latest").is_none());
        assert!(parse_package_spec("preview/mitex").is_none());
        assert!(parse_package_spec("preview").is_none());
    }

    #[test]
    fn scans_multiple_imports_in_source() {
        let source = r#"
            #import "@preview/cetz:0.5.2": canvas
            #import "@preview/oxifmt:1.0.0"
            #let x = "@not-a-package"
        "#;
        let imports = scan_imports(source);
        assert!(imports
            .iter()
            .any(|p| p.name == "cetz" && p.version == "0.5.2"));
        assert!(imports
            .iter()
            .any(|p| p.name == "oxifmt" && p.version == "1.0.0"));
    }

    #[test]
    #[ignore = "network: downloads from packages.typst.org"]
    fn fetches_and_extracts_a_real_package() {
        let bytes =
            fetch_tarball("https://packages.typst.org/preview/mitex-0.2.7.tar.gz").unwrap();
        assert!(bytes.len() > 1000, "expected a non-trivial tarball");

        let base = std::env::temp_dir().join(format!("ergo-net-{}", uuid::Uuid::new_v4()));
        let target = base.join("preview").join("mitex").join("0.2.7");
        install_tarball(&bytes, &target, "mitex", "0.2.7").unwrap();

        assert!(target.join("typst.toml").is_file());
        assert!(target.join("mitex.wasm").is_file());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn install_tarball_unpacks_root_level_files_into_version_dir() {
        use std::io::Write;

        // A Typst registry tarball keeps files at the archive root.
        let mut tar_builder = tar::Builder::new(Vec::new());
        let manifest = b"[package]\nname = \"demo\"\n";
        let mut header = tar::Header::new_gnu();
        header.set_size(manifest.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        tar_builder
            .append_data(&mut header, "typst.toml", &manifest[..])
            .unwrap();
        let tar_bytes = tar_builder.into_inner().unwrap();

        let mut encoder =
            flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(&tar_bytes).unwrap();
        let gz_bytes = encoder.finish().unwrap();

        let base = std::env::temp_dir().join(format!("ergo-pkg-{}", uuid::Uuid::new_v4()));
        let target = base.join("preview").join("demo").join("1.0.0");
        install_tarball(&gz_bytes, &target, "demo", "1.0.0").unwrap();

        let manifest_path = target.join("typst.toml");
        assert!(manifest_path.is_file(), "typst.toml should sit at the version dir root");
        assert_eq!(
            std::fs::read(&manifest_path).unwrap(),
            manifest.to_vec(),
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn collects_unique_preview_deps_and_skips_examples() {
        let files = vec![
            PackageFile {
                path: "packages/preview/orchid/0.1.0/lib.typ".to_string(),
                bytes: b"#import \"@preview/cetz:0.5.2\": *".to_vec(),
            },
            PackageFile {
                path: "packages/preview/orchid/0.1.0/lib.typ".to_string(),
                bytes: b"#import \"@preview/cetz:0.5.2\": *".to_vec(),
            },
            PackageFile {
                path: "packages/preview/orchid/0.1.0/examples/demo.typ".to_string(),
                bytes: b"#import \"@preview/fletcher:0.5.8\": *".to_vec(),
            },
        ];
        let deps = scan_preview_deps(&files);
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].name, "cetz");
    }
}
