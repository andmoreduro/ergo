use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_ide::IdeWorld;

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
            files: vfs
                .snapshot_binary_files()
                .into_iter()
                .map(|(path, bytes)| (path, Bytes::new(bytes)))
                .collect(),
        }
    }

    pub fn source_for_path(&self, path: &str) -> Result<Source, String> {
        let path = normalize_path(path);
        self.sources
            .get(&path)
            .cloned()
            .ok_or_else(|| format!("File not found: {}", path))
    }
}

pub struct ErgoWorld {
    vfs: Arc<VirtualFileSystem>,
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main: FileId,
}

impl ErgoWorld {
    pub fn new(vfs: Arc<VirtualFileSystem>, main: FileId) -> Self {
        let fonts = bundled_fonts().to_vec();
        let mut book = FontBook::new();
        for font in &fonts {
            book.push(font.info().clone());
        }

        Self {
            vfs,
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(book),
            fonts,
            main,
        }
    }
}

pub struct SnapshotWorld {
    snapshot: WorldSourceSnapshot,
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main: FileId,
}

impl SnapshotWorld {
    pub fn new(snapshot: WorldSourceSnapshot, main: FileId) -> Self {
        let fonts = bundled_fonts().to_vec();
        let mut book = FontBook::new();
        for font in &fonts {
            book.push(font.info().clone());
        }

        Self {
            snapshot,
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(book),
            fonts,
            main,
        }
    }
}

fn bundled_fonts() -> &'static Vec<Font> {
    static FONTS: OnceLock<Vec<Font>> = OnceLock::new();

    FONTS.get_or_init(|| {
        typst_assets::fonts()
            .flat_map(|font| Font::iter(Bytes::new(font.to_vec())))
            .collect()
    })
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
        let path = id.vpath().as_rootless_path().to_string_lossy().to_string();
        self.vfs
            .read_typst_source(&path)
            .map_err(|_| FileError::NotFound(path.into()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        let path = id.vpath().as_rootless_path().to_string_lossy().to_string();
        let bytes = self
            .vfs
            .read_file(&path)
            .map_err(|_| FileError::NotFound(path.into()))?;
        Ok(Bytes::new(bytes))
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
        let path = path_from_file_id(id);
        self.snapshot
            .sources
            .get(&path)
            .cloned()
            .ok_or_else(|| FileError::NotFound(path.into()))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
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

fn path_from_file_id(file_id: FileId) -> String {
    file_id
        .vpath()
        .as_rootless_path()
        .to_string_lossy()
        .replace('\\', "/")
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}
