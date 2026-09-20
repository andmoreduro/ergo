use std::collections::HashMap;
use std::path::PathBuf;

use ergo_core::package_resolver::{
    find_package_file_in_roots, package_roots_from_env, package_vfs_path, PackageRef,
};

#[test]
fn package_virtual_paths_match_archive_layout() {
    let package = PackageRef::from_import("@preview/versatile-apa", "7.2.0").unwrap();

    assert_eq!(
        package_vfs_path(&package, "lib.typ"),
        "packages/preview/versatile-apa/7.2.0/lib.typ",
    );
    assert_eq!(
        package_vfs_path(&package, "styles\\apa.typ"),
        "packages/preview/versatile-apa/7.2.0/styles/apa.typ",
    );
}

#[test]
fn package_roots_include_windows_and_unix_cache_locations() {
    let env = HashMap::from([
        ("LOCALAPPDATA", "C:/Users/Ada/AppData/Local"),
        ("APPDATA", "C:/Users/Ada/AppData/Roaming"),
        ("USERPROFILE", "C:/Users/Ada"),
        ("XDG_CACHE_HOME", "/home/ada/.cache"),
        ("XDG_DATA_HOME", "/home/ada/.local/share"),
        ("HOME", "/home/ada"),
    ]);

    let roots = package_roots_from_env(|key| env.get(key).map(|value| value.to_string()));

    assert!(roots.contains(&PathBuf::from("C:/Users/Ada/AppData/Local/typst/packages")));
    assert!(roots.contains(&PathBuf::from(
        "C:/Users/Ada/AppData/Roaming/typst/packages"
    )));
    assert!(roots.contains(&PathBuf::from("/home/ada/.cache/typst/packages")));
    assert!(roots.contains(&PathBuf::from("/home/ada/.local/share/typst/packages")));
}

#[test]
fn package_file_lookup_prefers_the_first_root_containing_the_file() {
    let stamp = format!(
        "ergo-package-resolver-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    );
    let base = std::env::temp_dir().join(stamp);
    let first = base.join("first");
    let second = base.join("second");
    let package = PackageRef::from_import("@preview/versatile-apa", "7.2.0").unwrap();

    let in_root = |root: &PathBuf, contents: &str| {
        let path = root
            .join("preview")
            .join("versatile-apa")
            .join("7.2.0")
            .join("lib.typ");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, contents).unwrap();
        path
    };
    let expected_first = in_root(&first, "#let apply = it => it");
    let _shadowed = in_root(&second, "#let shadowed = true");

    let found = find_package_file_in_roots(&package, "lib.typ", &[first.clone(), second]);

    std::fs::remove_dir_all(base).ok();
    assert_eq!(found, Some(expected_first));
}
