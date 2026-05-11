use typst::syntax::{FileId, VirtualPath};

pub fn normalize_virtual_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub fn file_id_for_virtual_path(path: &str) -> FileId {
    FileId::new(None, VirtualPath::new(normalize_virtual_path(path)))
}

pub fn path_from_file_id(file_id: FileId) -> String {
    file_id
        .vpath()
        .as_rootless_path()
        .to_string_lossy()
        .replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_windows_separators() {
        assert_eq!(
            normalize_virtual_path("sections\\intro.typ"),
            "sections/intro.typ"
        );
    }

    #[test]
    fn converts_file_id_to_rootless_virtual_path() {
        let file_id = file_id_for_virtual_path("sections\\intro.typ");

        assert_eq!(path_from_file_id(file_id), "sections/intro.typ");
    }
}
