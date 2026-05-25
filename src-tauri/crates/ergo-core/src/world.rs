use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_ide::IdeWorld;

use crate::package_resolver::{find_package_file, package_virtual_path_from_file_id};
use crate::path_utils::{normalize_virtual_path, path_from_file_id};
use crate::vfs::VirtualFileSystem;

#[derive(Clone)]
pub struct WorldSourceSnapshot {
    sources: HashMap<String, Source>,
    files: HashMap<String, Bytes>,
}

impl WorldSourceSnapshot {
    pub fn from_vfs(vfs: &VirtualFileSystem) -> Self {
        Self {
            sources: vfs.snapshot_sources(),
            files: vfs.snapshot_binary_files(),
        }
    }

    pub fn source_for_path(&self, path: &str) -> Result<Source, String> {
        let path = normalize_virtual_path(path);
        self.sources
            .get(&path)
            .cloned()
            .ok_or_else(|| format!("File not found: {}", path))
    }

    pub fn with_source(mut self, path: &str, text: String) -> Self {
        let path = normalize_virtual_path(path);
        self.sources.insert(
            path.clone(),
            Source::new(crate::path_utils::file_id_for_virtual_path(&path), text),
        );
        self
    }
}

pub struct ErgoWorld {
    pub(crate) vfs: Arc<VirtualFileSystem>,
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Arc<Vec<Font>>,
    pub(crate) main: FileId,
}

impl ErgoWorld {
    pub fn new(vfs: Arc<VirtualFileSystem>, main: FileId) -> Self {
        let fonts = bundled_fonts();
        Self {
            vfs,
            library: shared_library().clone(),
            book: shared_font_book().clone(),
            fonts,
            main,
        }
    }

    pub fn new_with_fonts(
        vfs: Arc<VirtualFileSystem>,
        main: FileId,
        fonts: Arc<Vec<Font>>,
        book: LazyHash<FontBook>,
    ) -> Self {
        Self {
            vfs,
            library: shared_library().clone(),
            book,
            fonts,
            main,
        }
    }

    pub fn vfs(&self) -> &VirtualFileSystem {
        &self.vfs
    }
}

pub struct SnapshotWorld {
    snapshot: WorldSourceSnapshot,
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Arc<Vec<Font>>,
    main: FileId,
}

impl SnapshotWorld {
    pub fn new(snapshot: WorldSourceSnapshot, main: FileId) -> Self {
        let fonts = bundled_fonts();
        Self {
            snapshot,
            library: shared_library().clone(),
            book: shared_font_book().clone(),
            fonts,
            main,
        }
    }

    pub fn new_with_fonts(
        snapshot: WorldSourceSnapshot,
        main: FileId,
        fonts: Arc<Vec<Font>>,
        book: LazyHash<FontBook>,
    ) -> Self {
        Self {
            snapshot,
            library: shared_library().clone(),
            book,
            fonts,
            main,
        }
    }
}

fn shared_library() -> &'static LazyHash<Library> {
    static LIBRARY: OnceLock<LazyHash<Library>> = OnceLock::new();
    LIBRARY.get_or_init(|| LazyHash::new(Library::default()))
}

fn shared_font_book() -> &'static LazyHash<FontBook> {
    static BOOK: OnceLock<LazyHash<FontBook>> = OnceLock::new();
    BOOK.get_or_init(|| {
        let fonts = bundled_fonts();
        let mut book = FontBook::new();
        for font in fonts.iter() {
            book.push(font.info().clone());
        }
        LazyHash::new(book)
    })
}

fn bundled_fonts() -> Arc<Vec<Font>> {
    static FONTS: OnceLock<Arc<Vec<Font>>> = OnceLock::new();

    FONTS
        .get_or_init(|| {
            Arc::new(
                typst_assets::fonts()
                    .flat_map(|font| Font::iter(Bytes::new(font.to_vec())))
                    .collect(),
            )
        })
        .clone()
}

impl World for ErgoWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if let Some(vpath) = package_virtual_path_from_file_id(id) {
            if let Ok(source) = self.vfs.read_typst_source(&vpath) {
                return Ok(source);
            }
            if let Some(path) = find_package_file(id) {
                let text = std::fs::read_to_string(&path)
                    .map_err(|_| FileError::NotFound(path.to_string_lossy().to_string().into()))?;
                return Ok(Source::new(id, text));
            }
            return Err(FileError::NotFound(vpath.into()));
        }

        let path = path_from_file_id(id);
        self.vfs
            .read_typst_source(&path)
            .map_err(|_| FileError::NotFound(path.into()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if let Some(vpath) = package_virtual_path_from_file_id(id) {
            if let Ok(bytes) = self.vfs.read_binary_file(&vpath) {
                return Ok(bytes);
            }
            if let Ok(source) = self.vfs.read_typst_source(&vpath) {
                return Ok(Bytes::new(source.text().as_bytes().to_vec()));
            }
            if let Some(path) = find_package_file(id) {
                let bytes = std::fs::read(&path)
                    .map_err(|_| FileError::NotFound(path.to_string_lossy().to_string().into()))?;
                return Ok(Bytes::new(bytes));
            }
            return Err(FileError::NotFound(vpath.into()));
        }

        let path = path_from_file_id(id);
        self.vfs
            .read_binary_file(&path)
            .map_err(|_| FileError::NotFound(path.into()))
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        None
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
}

impl IdeWorld for ErgoWorld {
    fn upcast(&self) -> &dyn World {
        self
    }
}

impl World for SnapshotWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if let Some(vpath) = package_virtual_path_from_file_id(id) {
            if let Some(source) = self.snapshot.sources.get(&vpath) {
                return Ok(source.clone());
            }
            if let Some(path) = find_package_file(id) {
                let text = std::fs::read_to_string(&path)
                    .map_err(|_| FileError::NotFound(path.to_string_lossy().to_string().into()))?;
                return Ok(Source::new(id, text));
            }
            return Err(FileError::NotFound(vpath.into()));
        }

        let path = path_from_file_id(id);
        self.snapshot
            .sources
            .get(&path)
            .cloned()
            .ok_or_else(|| FileError::NotFound(path.into()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if let Some(vpath) = package_virtual_path_from_file_id(id) {
            if let Some(bytes) = self.snapshot.files.get(&vpath) {
                return Ok(bytes.clone());
            }
            if let Some(source) = self.snapshot.sources.get(&vpath) {
                return Ok(Bytes::new(source.text().as_bytes().to_vec()));
            }
            if let Some(path) = find_package_file(id) {
                let bytes = std::fs::read(&path)
                    .map_err(|_| FileError::NotFound(path.to_string_lossy().to_string().into()))?;
                return Ok(Bytes::new(bytes));
            }
            return Err(FileError::NotFound(vpath.into()));
        }

        let path = path_from_file_id(id);
        if let Some(bytes) = self.snapshot.files.get(&path) {
            return Ok(bytes.clone());
        }

        self.snapshot
            .sources
            .get(&path)
            .map(|source| Bytes::new(source.text().as_bytes().to_vec()))
            .ok_or_else(|| FileError::NotFound(path.into()))
    }

    fn today(&self, _offset: Option<i64>) -> Option<Datetime> {
        None
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }
}

impl IdeWorld for SnapshotWorld {
    fn upcast(&self) -> &dyn World {
        self
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use typst::syntax::{package::PackageSpec, FileId, VirtualPath};

    use super::*;
    use crate::path_utils::file_id_for_virtual_path;

    #[test]
    fn package_sources_are_read_from_vfs_archive_layout() {
        let vfs = Arc::new(VirtualFileSystem::new());
        vfs.write_source(
            "packages/preview/test-package/1.0.0/lib.typ",
            "#let value = 1".to_string(),
        );
        let package: PackageSpec = "@preview/test-package:1.0.0".parse().unwrap();
        let package_file = FileId::new(Some(package), VirtualPath::new("lib.typ"));
        let world = ErgoWorld::new(vfs, file_id_for_virtual_path("main.typ"));

        let source = world.source(package_file).unwrap();

        assert_eq!(source.text(), "#let value = 1");
    }
}
