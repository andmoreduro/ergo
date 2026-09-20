use typst::syntax::{FileId, RootedPath, VirtualPath, VirtualRoot};

pub fn normalize_virtual_path(path: &str) -> String {
    path.replace('\\', "/")
}

/// A project-rooted virtual path. Typst rejects paths that escape the root
/// (`..` above the project); such segments are dropped rather than failing, since
/// every VFS path Érgo materializes is already root-relative.
pub fn virtual_path(path: &str) -> VirtualPath {
    let normalized = normalize_virtual_path(path);
    VirtualPath::new(&normalized).unwrap_or_else(|_| {
        let contained: Vec<&str> = normalized
            .split('/')
            .filter(|segment| !segment.is_empty() && *segment != "..")
            .collect();
        VirtualPath::new(contained.join("/")).expect("path without parent segments is valid")
    })
}

pub fn file_id_for_virtual_path(path: &str) -> FileId {
    FileId::new(RootedPath::new(VirtualRoot::Project, virtual_path(path)))
}

pub fn path_from_file_id(file_id: FileId) -> String {
    file_id.vpath().get_without_slash().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn virtual_path_roundtrip() {
        assert_eq!(
            normalize_virtual_path("sections\\intro.typ"),
            "sections/intro.typ"
        );
        let file_id = file_id_for_virtual_path("sections\\intro.typ");
        assert_eq!(path_from_file_id(file_id), "sections/intro.typ");
    }
}
