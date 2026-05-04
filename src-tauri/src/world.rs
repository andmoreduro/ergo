use std::sync::{Arc, OnceLock};
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

use crate::vfs::VirtualFileSystem;

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
