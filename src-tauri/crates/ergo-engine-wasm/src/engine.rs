use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use ergo_core::ast::DocumentAST;
use ergo_core::compilation_types::{CompilationResult, CompilationStatus};
use ergo_core::document_session::DocumentSession;
use ergo_core::document_session_types::{DocumentEvent, DocumentSessionStatus};
use ergo_core::path_utils::file_id_for_virtual_path;
use ergo_core::preview_pipeline::{apply_document_events, compile_preview_success};
use ergo_core::preview_sync::{PreviewFocusTarget, PreviewSyncState};
use ergo_core::resource_watch::RESOURCE_WATCH_MAIN;
use ergo_core::vfs::VirtualFileSystem;
use ergo_core::world::{ErgoWorld, WorldSourceSnapshot};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use typst::foundations::Bytes;
use typst::layout::PagedDocument;
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;

static CUSTOM_FONTS: RwLock<Option<Arc<Vec<Font>>>> = RwLock::new(None);
static CUSTOM_FONT_BOOK: RwLock<Option<LazyHash<FontBook>>> = RwLock::new(None);
static FONT_STAMP: AtomicU64 = AtomicU64::new(0);

pub fn bundled_fonts_vec() -> Vec<Font> {
    typst_assets::fonts()
        .flat_map(|font| Font::iter(Bytes::new(font.to_vec())))
        .collect()
}

pub fn store_fonts(fonts: Vec<Font>) {
    let mut book = FontBook::new();
    for font in &fonts {
        book.push(font.info().clone());
    }
    *CUSTOM_FONTS.write() = Some(Arc::new(fonts));
    *CUSTOM_FONT_BOOK.write() = Some(LazyHash::new(book));
    FONT_STAMP.fetch_add(1, Ordering::SeqCst);
}

#[cfg(target_arch = "wasm32")]
pub fn extend_fonts_from_js_buffers(fonts: &mut Vec<Font>, font_buffers: js_sys::Array) {
    for val in font_buffers.iter() {
        let array: js_sys::Uint8Array = val.into();
        let buf = array.to_vec();
        fonts.extend(Font::iter(Bytes::new(buf)));
    }
}

#[cfg(target_arch = "wasm32")]
pub fn append_font_buffers(font_buffers: js_sys::Array) {
    console_error_panic_hook::set_once();
    let mut fonts = CUSTOM_FONTS
        .read()
        .as_ref()
        .map(|stored| stored.as_ref().clone())
        .unwrap_or_else(bundled_fonts_vec);
    extend_fonts_from_js_buffers(&mut fonts, font_buffers);
    store_fonts(fonts);
}

fn active_fonts() -> Arc<Vec<Font>> {
    let guard = CUSTOM_FONTS.read();
    if let Some(fonts) = &*guard {
        return fonts.clone();
    }
    Arc::new(bundled_fonts_vec())
}

fn active_font_book() -> LazyHash<FontBook> {
    let guard = CUSTOM_FONT_BOOK.read();
    if let Some(book) = &*guard {
        return book.clone();
    }
    let fonts = active_fonts();
    let mut book = FontBook::new();
    for font in fonts.iter() {
        book.push(font.info().clone());
    }
    LazyHash::new(book)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VfsFileEntry {
    pub path: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct PageImage {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BootstrapPreviewOutput {
    pub status: DocumentSessionStatus,
    pub result: CompilationResult,
}

fn make_world(vfs: Arc<VirtualFileSystem>, main: &str) -> ErgoWorld {
    ErgoWorld::new_with_fonts(
        vfs,
        file_id_for_virtual_path(main),
        active_fonts(),
        active_font_book(),
    )
}

/// Native/WASM preview engine: AST sync → Typst compile → canvas rasterization.
pub struct ErgoPreviewEngine {
    vfs: Arc<VirtualFileSystem>,
    session: DocumentSession,
    preview_world: ErgoWorld,
    resource_world: ErgoWorld,
    world_font_stamp: u64,
    document: Option<Arc<PagedDocument>>,
    resource_document: Option<Arc<PagedDocument>>,
    sync_state: PreviewSyncState,
}

impl ErgoPreviewEngine {
    pub fn new() -> Self {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        let preview_world = make_world(Arc::clone(&vfs), "main.typ");
        let resource_world = make_world(Arc::clone(&vfs), RESOURCE_WATCH_MAIN);
        Self {
            vfs,
            session,
            preview_world,
            resource_world,
            world_font_stamp: FONT_STAMP.load(Ordering::SeqCst),
            document: None,
            resource_document: None,
            sync_state: PreviewSyncState::default(),
        }
    }

    fn sync_worlds_if_needed(&mut self) {
        let stamp = FONT_STAMP.load(Ordering::SeqCst);
        if self.world_font_stamp == stamp {
            return;
        }
        self.preview_world = make_world(Arc::clone(&self.vfs), "main.typ");
        self.resource_world = make_world(Arc::clone(&self.vfs), RESOURCE_WATCH_MAIN);
        self.world_font_stamp = stamp;
    }

    pub fn write_vfs_files(&self, files: Vec<VfsFileEntry>) {
        for file in files {
            self.vfs.write_file(&file.path, file.bytes);
        }
    }

    pub fn write_file(&self, path: &str, bytes: &[u8]) {
        self.vfs.write_file(path, bytes.to_vec());
    }

    pub fn write_source(&self, path: &str, text: &str) {
        self.vfs.write_source(path, text.to_string());
    }

    pub fn apply_patch(&self, path: &str, start: usize, end: usize, text: &str) -> Result<(), String> {
        self.vfs.apply_patch(path, start, end, text)
    }

    pub fn sync_snapshot(&mut self, ast: DocumentAST) -> Result<DocumentSessionStatus, String> {
        self.session.sync_snapshot(ast)
    }

    pub fn apply_event(&mut self, event: DocumentEvent) -> Result<DocumentSessionStatus, String> {
        self.session.apply_event(event)
    }

    pub fn sync_events(&mut self, events: Vec<DocumentEvent>) -> Result<DocumentSessionStatus, String> {
        apply_document_events(&mut self.session, events)
    }

    pub fn run_compile_preview(&mut self) -> (DocumentSessionStatus, CompilationResult) {
        self.sync_worlds_if_needed();
        let source_revision = self.vfs.latest_revision();
        let status = self.session.status();

        let cached_resource_document = self.resource_document.as_deref();
        match compile_preview_success(
            &self.preview_world,
            &self.resource_world,
            &self.session,
            cached_resource_document,
        ) {
            Ok(success) => {
                let source_snapshot = WorldSourceSnapshot::from_vfs(&self.vfs);
                let document = Arc::new(success.document);

                self.sync_state.store_preview(
                    source_revision,
                    Arc::clone(&document),
                    status.source_map.clone(),
                    status.field_source_map.clone(),
                    source_snapshot,
                );

                self.document = Some(document);
                if let Some(resource_document) = success.resource_document {
                    self.resource_document = Some(Arc::new(resource_document));
                }

                let result = CompilationResult {
                    source_revision,
                    status: CompilationStatus::Succeeded,
                    preview_pages: Some(success.preview_pages),
                    export_path: None,
                    diagnostics: Vec::new(),
                    outline: Some(success.outline),
                    resources: success.resources,
                };
                (status, result)
            }
            Err(error) => {
                let result = CompilationResult {
                    source_revision,
                    status: CompilationStatus::Failed,
                    preview_pages: None,
                    export_path: None,
                    diagnostics: vec![error.to_string()],
                    outline: None,
                    resources: None,
                };
                (status, result)
            }
        }
    }

    pub fn compile_preview(&mut self) -> CompilationResult {
        self.run_compile_preview().1
    }

    pub fn bootstrap_preview(
        &mut self,
        ast: DocumentAST,
        files: Vec<VfsFileEntry>,
    ) -> Result<BootstrapPreviewOutput, String> {
        self.write_vfs_files(files);
        let status = self.sync_snapshot(ast)?;
        let result = self.compile_preview();
        Ok(BootstrapPreviewOutput { status, result })
    }

    pub fn render_page(&self, page_index: usize, pixel_per_pt: f32) -> Result<PageImage, String> {
        Self::render_document_page(self.document.as_deref(), page_index, pixel_per_pt)
    }

    pub fn render_resource_page(
        &self,
        page_number: usize,
        pixel_per_pt: f32,
    ) -> Result<PageImage, String> {
        Self::render_document_page(
            self.resource_document.as_deref(),
            page_number.saturating_sub(1),
            pixel_per_pt,
        )
    }

    pub fn render_changed_pages(
        &self,
        result: &CompilationResult,
        pixel_per_pt: f32,
    ) -> Result<Vec<PageImage>, String> {
        let pages = result
            .preview_pages
            .as_ref()
            .ok_or_else(|| "Preview compile did not return page metadata".to_string())?;

        pages
            .iter()
            .filter(|page| page.changed)
            .map(|page| {
                self.render_page(page.page_number.saturating_sub(1), pixel_per_pt)
            })
            .collect()
    }

    fn render_document_page(
        document: Option<&PagedDocument>,
        page_index: usize,
        pixel_per_pt: f32,
    ) -> Result<PageImage, String> {
        let doc =
            document.ok_or_else(|| "No compiled document available".to_string())?;

        let page = doc
            .pages
            .get(page_index)
            .ok_or_else(|| format!("Page index out of bounds: {page_index}"))?;

        let pixmap = typst_render::render(page, pixel_per_pt);

        Ok(PageImage {
            width: pixmap.width(),
            height: pixmap.height(),
            pixels: pixmap.data().to_vec(),
        })
    }

    pub fn jump_from_click(
        &self,
        page_number: usize,
        x_pt: f64,
        y_pt: f64,
        source_revision: u64,
    ) -> ergo_core::preview_sync_types::PreviewJumpResult {
        self.sync_state
            .jump_from_click(page_number, x_pt, y_pt, source_revision)
    }

    pub fn positions_for_focus(
        &self,
        target: &PreviewFocusTarget,
        source_revision: u64,
    ) -> ergo_core::preview_sync_types::PreviewElementPositionsResult {
        self.sync_state.positions_for_focus(target, source_revision)
    }

    pub fn export_pdf(&mut self) -> Result<Vec<u8>, String> {
        let result = self.compile_preview();
        if result.status != CompilationStatus::Succeeded {
            let message = result
                .diagnostics
                .first()
                .cloned()
                .unwrap_or_else(|| "Preview compile failed before export".to_string());
            return Err(message);
        }

        let doc = self
            .document
            .as_deref()
            .ok_or_else(|| "No compiled document available".to_string())?;

        typst_pdf::pdf(doc, &typst_pdf::PdfOptions::default())
            .map_err(|error| format!("PDF export failed: {error:?}"))
    }

    pub fn export_png(&mut self, page_index: usize, pixel_per_pt: f32) -> Result<Vec<u8>, String> {
        let result = self.compile_preview();
        if result.status != CompilationStatus::Succeeded {
            let message = result
                .diagnostics
                .first()
                .cloned()
                .unwrap_or_else(|| "Preview compile failed before export".to_string());
            return Err(message);
        }

        let page = self
            .document
            .as_deref()
            .and_then(|doc| doc.pages.get(page_index))
            .ok_or_else(|| format!("Page index out of bounds: {page_index}"))?;

        let pixmap = typst_render::render(page, pixel_per_pt);
        pixmap
            .encode_png()
            .map_err(|error| format!("PNG export failed: {error:?}"))
    }
}
