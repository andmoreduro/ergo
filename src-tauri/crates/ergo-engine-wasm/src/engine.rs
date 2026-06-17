use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use base64::Engine;
use ergo_core::ast::DocumentAST;
use ergo_core::compilation_types::{CompilationResult, CompilationStatus, PreviewPageFile};
use ergo_core::compile_artifacts::fingerprint_page;
use ergo_core::document_resources::ResourcePreviewStatus;
use ergo_core::document_session::DocumentSession;
use ergo_core::document_session_types::{DocumentEvent, DocumentSessionStatus};
use ergo_core::path_utils::file_id_for_virtual_path;
use ergo_core::preview_pipeline::{
    apply_document_events, compile_preview_success, compile_resource_previews,
    load_template_for_ast,
};
use ergo_core::preview_sync::PreviewSyncState;
use ergo_core::resource_watch::RESOURCE_WATCH_MAIN;
use ergo_core::vfs::VirtualFileSystem;
use ergo_core::world::{ErgoWorld, WorldSourceSnapshot};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use typst::foundations::Bytes;
use typst::layout::PagedDocument;
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;

#[cfg(target_arch = "wasm32")]
use web_sys::console;

fn wasm_log_engine(level: &str, message: &str) {
    let formatted = format!("[ergo-engine {level}] {message}");
    #[cfg(target_arch = "wasm32")]
    console::log_1(&formatted.into());
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = formatted;
        let _ = level;
    }
}

static CUSTOM_FONTS: RwLock<Option<Arc<Vec<Font>>>> = RwLock::new(None);
static CUSTOM_FONT_BOOK: RwLock<Option<LazyHash<FontBook>>> = RwLock::new(None);
static FONT_STAMP: AtomicU64 = AtomicU64::new(0);

/// How many compile generations Typst's `comemo` memoization cache may retain.
///
/// `comemo` (used internally by `typst::compile`, layout, and the SVG/raster
/// renderers) is a process-global, append-only cache: every compile memoizes
/// fresh entries keyed by content hash and never drops them on its own. Because
/// the worker holds one long-lived engine and WASM linear memory only ever
/// grows, that cache balloons with each keystroke — the dominant cause of the
/// preview process climbing into the gigabytes on large documents. Calling
/// `comemo::evict` once per compile cycle ages the cache and drops entries not
/// touched for this many cycles, bounding peak memory. Entries for the document's
/// current state are re-touched on every compile and so never age out; only
/// superseded states (old text the user has since changed) are reclaimed. Lower
/// reclaims sooner (less memory); higher tolerates more edit oscillation
/// (undo/redo, retyping) before dropping reusable work.
const COMEMO_MAX_AGE: usize = 10;

pub fn bundled_fonts_vec() -> Vec<Font> {
    typst_assets::fonts()
        .flat_map(|font| Font::iter(Bytes::new(font.to_vec())))
        .collect()
}

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub fn store_fonts(fonts: Vec<Font>) {
    let mut book = FontBook::new();
    for font in &fonts {
        book.push(font.info().clone());
    }
    // Tell `ergo_core`'s font-availability check which families this build can
    // actually render. On WASM there is no system font database, so without this
    // the generated `#set text(font: …)` would downgrade any streamed-in system
    // or project font to a bundled fallback. See `set_registered_font_families`.
    ergo_core::font_availability::set_registered_font_families(
        fonts.iter().map(|font| font.info().family.clone()),
    );
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

#[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
pub fn reset_fonts_to_bundled() {
    store_fonts(bundled_fonts_vec());
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
    pub width_pt: f64,
    pub height_pt: f64,
    pub pixels: Vec<u8>,
}

/// A rasterized vertical band of a page for the canvas preview.
///
/// `band_width`/`band_height` are the rendered band's device-pixel dimensions;
/// `page_width_pt`/`page_height_pt` are the full page in points (so the canvas can
/// size the whole page); `y_min_pt`/`y_max_pt` are the clamped band the engine
/// actually rendered. `pixels` is **straight** (non-premultiplied) RGBA so it can
/// back an `ImageData`/`ImageBitmap` without colour fringing.
#[derive(Clone, Debug)]
pub struct PageRegionImage {
    pub band_width: u32,
    pub band_height: u32,
    pub page_width_pt: f64,
    pub page_height_pt: f64,
    pub x_min_pt: f64,
    pub x_max_pt: f64,
    pub y_min_pt: f64,
    pub y_max_pt: f64,
    pub pixel_per_pt: f32,
    pub pixels: Vec<u8>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PageSvg {
    pub width_pt: f64,
    pub height_pt: f64,
    pub svg: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PagePng {
    pub width_pt: f64,
    pub height_pt: f64,
    pub data_url: String,
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

fn preview_pages_for_document(
    document: &PagedDocument,
    previous_fingerprints: &mut Vec<u64>,
) -> Vec<PreviewPageFile> {
    let fingerprints: Vec<u64> = document.pages.iter().map(fingerprint_page).collect();
    let pages = document
        .pages
        .iter()
        .enumerate()
        .map(|(index, page)| {
            let page_number = index + 1;
            let size = page.frame.size();
            PreviewPageFile {
                page_number,
                path: format!("page-{page_number}"),
                changed: previous_fingerprints.get(index) != Some(&fingerprints[index]),
                width_pt: Some(size.x.to_pt()),
                height_pt: Some(size.y.to_pt()),
                content: None,
            }
        })
        .collect();
    *previous_fingerprints = fingerprints;
    pages
}

/// Native/WASM preview engine: AST sync → Typst compile → page rendering.
pub struct ErgoPreviewEngine {
    vfs: Arc<VirtualFileSystem>,
    session: DocumentSession,
    preview_world: ErgoWorld,
    resource_world: ErgoWorld,
    world_font_stamp: u64,
    document: Option<Arc<PagedDocument>>,
    resource_document: Option<Arc<PagedDocument>>,
    preview_page_fingerprints: Vec<u64>,
    sync_state: PreviewSyncState,
}

impl ErgoPreviewEngine {
    pub fn new() -> Self {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new_preview(Arc::clone(&vfs));
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
            preview_page_fingerprints: Vec::new(),
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

    pub fn apply_patch(
        &self,
        path: &str,
        start: usize,
        end: usize,
        text: &str,
    ) -> Result<(), String> {
        self.vfs.apply_patch(path, start, end, text)
    }

    pub fn sync_snapshot(&mut self, ast: DocumentAST) -> Result<DocumentSessionStatus, String> {
        self.session.sync_snapshot(ast)
    }

    pub fn apply_event(&mut self, event: DocumentEvent) -> Result<DocumentSessionStatus, String> {
        self.session.apply_event(event)
    }

    pub fn sync_events(
        &mut self,
        events: Vec<DocumentEvent>,
    ) -> Result<DocumentSessionStatus, String> {
        apply_document_events(&self.session, events)
    }

    pub fn run_compile_preview(&mut self) -> CompilationResult {
        // Bound Typst's global incremental-compile cache before this cycle adds
        // to it. Without this the cache (and the worker's WASM memory) grows
        // unbounded as the user types. See `COMEMO_MAX_AGE`.
        comemo::evict(COMEMO_MAX_AGE);

        self.sync_worlds_if_needed();
        let source_revision = self.vfs.latest_revision();

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

                // Clone the maps once (straight into `store_preview`) instead of
                // cloning the whole status and then the maps again.
                let (source_map, field_source_map) = self.session.preview_sync_maps();
                self.sync_state.store_preview(
                    source_revision,
                    Arc::clone(&document),
                    source_map,
                    field_source_map,
                    source_snapshot,
                );

                let preview_pages =
                    preview_pages_for_document(&document, &mut self.preview_page_fingerprints);

                self.document = Some(document);
                if let Some(resource_document) = success.resource_document {
                    self.resource_document = Some(Arc::new(resource_document));
                }

                CompilationResult {
                    source_revision,
                    status: CompilationStatus::Succeeded,
                    preview_pages: Some(preview_pages),
                    export_path: None,
                    diagnostics: Vec::new(),
                    outline: Some(success.outline),
                    resources: success.resources,
                }
            }
            Err(error) => CompilationResult {
                source_revision,
                status: CompilationStatus::Failed,
                preview_pages: None,
                export_path: None,
                diagnostics: vec![error.to_string()],
                outline: None,
                resources: None,
            },
        }
    }

    pub fn compile_preview(&mut self) -> CompilationResult {
        self.run_compile_preview()
    }

    /// Compile, then inline the rendered SVG of the requested pages into their
    /// `content` so the client can paint them without a second worker trip.
    /// Only changed pages are rendered (an unchanged page is served from the
    /// client-side cache), mirroring the page view's own re-render condition.
    pub fn compile_preview_with_svg(&mut self, svg_page_indices: &[usize]) -> CompilationResult {
        let mut result = self.run_compile_preview();
        self.inline_svg_pages(&mut result, svg_page_indices);
        result
    }

    fn inline_svg_pages(&self, result: &mut CompilationResult, svg_page_indices: &[usize]) {
        if svg_page_indices.is_empty() || result.status != CompilationStatus::Succeeded {
            return;
        }
        let Some(pages) = result.preview_pages.as_mut() else {
            return;
        };
        for &index in svg_page_indices {
            let Some(page) = pages.get_mut(index) else {
                continue;
            };
            if !page.changed {
                continue;
            }
            if let Ok(svg) = Self::render_document_svg_page(self.document.as_deref(), index) {
                page.content = Some(svg.svg);
            }
        }
    }

    /// Drop the previous project's VFS, session, compiled documents, and preview
    /// caches so a shorter document cannot inherit extra pages from the prior compile.
    pub fn reset_for_new_project(&mut self) {
        self.vfs.clear();
        self.session = DocumentSession::new_preview(Arc::clone(&self.vfs));
        self.sync_worlds_if_needed();
        self.preview_world = make_world(Arc::clone(&self.vfs), "main.typ");
        self.resource_world = make_world(Arc::clone(&self.vfs), RESOURCE_WATCH_MAIN);
        self.document = None;
        self.resource_document = None;
        self.preview_page_fingerprints.clear();
        self.sync_state = PreviewSyncState::default();
    }

    pub fn bootstrap_preview(
        &mut self,
        ast: DocumentAST,
        files: Vec<VfsFileEntry>,
    ) -> Result<BootstrapPreviewOutput, String> {
        self.reset_for_new_project();
        self.write_vfs_files(files);
        let status = self.sync_snapshot(ast)?;
        // Inline the first page so the initial open paints in a single trip.
        let result = self.compile_preview_with_svg(&[0]);
        Ok(BootstrapPreviewOutput { status, result })
    }

    pub fn render_page(&self, page_index: usize, pixel_per_pt: f32) -> Result<PageImage, String> {
        Self::render_document_page(self.document.as_deref(), page_index, pixel_per_pt)
    }

    pub fn render_svg_page(&self, page_index: usize) -> Result<PageSvg, String> {
        Self::render_document_svg_page(self.document.as_deref(), page_index)
    }

    pub fn render_png_page(
        &self,
        page_index: usize,
        pixel_per_pt: f32,
    ) -> Result<PagePng, String> {
        Self::render_document_png_page(self.document.as_deref(), page_index, pixel_per_pt)
    }

    /// Rasterize the visible region `[x_min,x_max) × [y_min,y_max)` of a page.
    pub fn render_page_region(
        &self,
        page_index: usize,
        pixel_per_pt: f32,
        x_min_pt: f64,
        x_max_pt: f64,
        y_min_pt: f64,
        y_max_pt: f64,
    ) -> Result<PageRegionImage, String> {
        Self::render_document_region(
            self.document.as_deref(),
            page_index,
            pixel_per_pt,
            x_min_pt,
            x_max_pt,
            y_min_pt,
            y_max_pt,
        )
    }

    /// Rasterize the visible region of a resource-preview page at the density
    /// needed for a bitmap `target_width_px` pixels wide, compiling the resource
    /// document on demand if the main preview has not produced it yet.
    pub fn render_resource_region(
        &mut self,
        page_number: usize,
        target_width_px: u32,
        x_min_pt: f64,
        x_max_pt: f64,
        y_min_pt: f64,
        y_max_pt: f64,
    ) -> Result<PageRegionImage, String> {
        self.ensure_resource_document_compiled()?;
        let doc = self
            .resource_document
            .as_deref()
            .ok_or_else(|| "No compiled document available".to_string())?;
        let page_index = page_number.saturating_sub(1);
        let page = doc
            .pages
            .get(page_index)
            .ok_or_else(|| format!("Page index out of bounds: {page_index}"))?;
        let page_width_pt = page.frame.size().x.to_pt();
        let pixel_per_pt = if page_width_pt > 0.0 {
            (target_width_px as f64 / page_width_pt) as f32
        } else {
            1.0f32
        };
        Self::render_document_region(
            Some(doc),
            page_index,
            pixel_per_pt,
            x_min_pt,
            x_max_pt,
            y_min_pt,
            y_max_pt,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn render_document_region(
        document: Option<&PagedDocument>,
        page_index: usize,
        pixel_per_pt: f32,
        x_min_pt: f64,
        x_max_pt: f64,
        y_min_pt: f64,
        y_max_pt: f64,
    ) -> Result<PageRegionImage, String> {
        let doc = document.ok_or_else(|| "No compiled document available".to_string())?;

        let page = doc
            .pages
            .get(page_index)
            .ok_or_else(|| format!("Page index out of bounds: {page_index}"))?;

        let size = page.frame.size();
        let page_width_pt = size.x.to_pt();
        let page_height_pt = size.y.to_pt();
        let x0 = x_min_pt.clamp(0.0, page_width_pt);
        let x1 = x_max_pt.clamp(x0, page_width_pt);
        let y0 = y_min_pt.clamp(0.0, page_height_pt);
        let y1 = y_max_pt.clamp(y0, page_height_pt);

        let pixmap = ergo_typst_render::render_region(page, pixel_per_pt, x0, x1, y0, y1);

        // Demultiply: typst/tiny-skia pixmaps are premultiplied RGBA, but
        // `ImageData`/`ImageBitmap` expect straight alpha. Opaque pixels (most
        // glyph interiors) are unchanged; this only corrects AA edges and
        // translucent fills, which would otherwise fringe dark on the canvas.
        let mut pixels = Vec::with_capacity((pixmap.width() * pixmap.height() * 4) as usize);
        for px in pixmap.pixels() {
            let color = px.demultiply();
            pixels.extend_from_slice(&[
                color.red(),
                color.green(),
                color.blue(),
                color.alpha(),
            ]);
        }

        Ok(PageRegionImage {
            band_width: pixmap.width(),
            band_height: pixmap.height(),
            page_width_pt,
            page_height_pt,
            x_min_pt: x0,
            x_max_pt: x1,
            y_min_pt: y0,
            y_max_pt: y1,
            pixel_per_pt,
            pixels,
        })
    }

    pub fn render_resource_svg_page(
        &mut self,
        page_number: usize,
    ) -> Result<PageSvg, String> {
        wasm_log_engine(
            "info",
            &format!(
                "render_resource_svg_page start page={page_number} resource_document={}",
                self.resource_document.is_some()
            ),
        );
        self.ensure_resource_document_compiled()?;
        wasm_log_engine(
            "info",
            &format!(
                "render_resource_svg_page after ensure resource_document={}",
                self.resource_document.is_some()
            ),
        );
        Self::render_document_svg_page(
            self.resource_document.as_deref(),
            page_number.saturating_sub(1),
        )
    }

    /// Compile the resource preview document if it is missing. This guards
    /// against render races where the main preview has not yet triggered a
    /// resource compile (e.g. during sidebar resize before the first paint).
    fn ensure_resource_document_compiled(&mut self) -> Result<(), String> {
        let had_resource = self.resource_document.is_some();
        wasm_log_engine(
            "info",
            &format!("ensure_resource_document_compiled start had_resource={had_resource}"),
        );
        if had_resource {
            return Ok(());
        }
        let ast = self
            .session
            .ast()
            .ok_or_else(|| "No AST available for resource preview compile".to_string())?;
        let template = load_template_for_ast(&ast).map_err(|e| e.to_string())?;
        let (resource_document, resources) = match compile_resource_previews(
            &self.resource_world,
            &self.vfs,
            &ast,
            &template,
        ) {
            Ok(result) => result,
            Err(error) => {
                wasm_log_engine(
                    "error",
                    &format!("compile_resource_previews error: {error}"),
                );
                return Err(format!(
                    "Resource preview compile failed (on demand): {error}"
                ));
            }
        };
        wasm_log_engine(
            "info",
            &format!(
                "compile_resource_previews returned document={} groups={}",
                resource_document.is_some(),
                resources.groups.len()
            ),
        );
        if let Some(document) = resource_document {
            let page_count = document.pages.len();
            self.resource_document = Some(Arc::new(document));
            wasm_log_engine(
                "info",
                &format!("ensure_resource_document_compiled stored pages={page_count}"),
            );
            return Ok(());
        }
        // compile_resource_previews returns Ok(None, ...) when the Typst compile
        // itself failed. Surface the first failed-entry diagnostic so the
        // frontend/writer can see why resource previews did not render.
        let diagnostic = resources
            .groups
            .iter()
            .flat_map(|group| &group.entries)
            .filter_map(|entry| {
                if entry.preview.status == ResourcePreviewStatus::Failed {
                    entry.preview.diagnostic.clone()
                } else {
                    None
                }
            })
            .next()
            .unwrap_or_else(|| "Resource preview compile produced no pages".to_string());
        Err(format!(
            "Resource preview compile failed (on demand): {diagnostic}"
        ))
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
            .map(|page| self.render_page(page.page_number.saturating_sub(1), pixel_per_pt))
            .collect()
    }

    fn render_document_page(
        document: Option<&PagedDocument>,
        page_index: usize,
        pixel_per_pt: f32,
    ) -> Result<PageImage, String> {
        let doc = document.ok_or_else(|| "No compiled document available".to_string())?;

        let page = doc
            .pages
            .get(page_index)
            .ok_or_else(|| format!("Page index out of bounds: {page_index}"))?;

        let size = page.frame.size();
        let pixmap = typst_render::render(page, pixel_per_pt);

        Ok(PageImage {
            width: pixmap.width(),
            height: pixmap.height(),
            width_pt: size.x.to_pt(),
            height_pt: size.y.to_pt(),
            pixels: pixmap.data().to_vec(),
        })
    }

    fn render_document_svg_page(
        document: Option<&PagedDocument>,
        page_index: usize,
    ) -> Result<PageSvg, String> {
        let doc = document.ok_or_else(|| "No compiled document available".to_string())?;

        let page = doc
            .pages
            .get(page_index)
            .ok_or_else(|| format!("Page index out of bounds: {page_index}"))?;

        let size = page.frame.size();
        Ok(PageSvg {
            width_pt: size.x.to_pt(),
            height_pt: size.y.to_pt(),
            svg: typst_svg::svg(page),
        })
    }

    fn render_document_png_page(
        document: Option<&PagedDocument>,
        page_index: usize,
        pixel_per_pt: f32,
    ) -> Result<PagePng, String> {
        let doc = document.ok_or_else(|| "No compiled document available".to_string())?;

        let page = doc
            .pages
            .get(page_index)
            .ok_or_else(|| format!("Page index out of bounds: {page_index}"))?;

        let size = page.frame.size();
        let pixmap = typst_render::render(page, pixel_per_pt);
        let png = pixmap
            .encode_png()
            .map_err(|e| format!("PNG encode failed: {e:?}"))?;
        let base64 = base64::engine::general_purpose::STANDARD.encode(&png);
        let data_url = format!("data:image/png;base64,{base64}");

        Ok(PagePng {
            width_pt: size.x.to_pt(),
            height_pt: size.y.to_pt(),
            data_url,
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

    fn compiled_document(&mut self) -> Result<&PagedDocument, String> {
        let result = self.compile_preview();
        if result.status != CompilationStatus::Succeeded {
            let message = result
                .diagnostics
                .first()
                .cloned()
                .unwrap_or_else(|| "Preview compile failed before export".to_string());
            return Err(message);
        }

        self.document
            .as_deref()
            .ok_or_else(|| "No compiled document available".to_string())
    }

    pub fn export_all_png(&mut self, pixel_per_pt: f32) -> Result<Vec<Vec<u8>>, String> {
        let document = self.compiled_document()?;
        use rayon::prelude::*;
        document
            .pages
            .par_iter()
            .map(|page| {
                typst_render::render(page, pixel_per_pt)
                    .encode_png()
                    .map_err(|error| format!("PNG export failed: {error:?}"))
            })
            .collect()
    }

    pub fn export_all_svg(&mut self) -> Result<Vec<String>, String> {
        let document = self.compiled_document()?;
        Ok(ergo_core::compile_artifacts::render_svgs(document))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ergo_core::test_fixtures::basic_document_ast;

    #[test]
    fn render_page_uses_project_paper_size_for_page_frame() {
        let mut ast = basic_document_ast("A5 page", "");
        ast.metadata.project_settings.paper_size = Some("a5".to_string());

        let mut engine = ErgoPreviewEngine::new();
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");
        let result = engine.compile_preview();
        assert_eq!(result.status, CompilationStatus::Succeeded);

        let image = engine
            .render_page(0, 1.0)
            .expect("compiled page should render");

        assert!(
            (410.0..=430.0).contains(&image.width_pt),
            "A5 width should be about 420pt, got {}",
            image.width_pt
        );
        assert!(
            (585.0..=605.0).contains(&image.height_pt),
            "A5 height should be about 595pt, got {}",
            image.height_pt
        );
        assert!(
            (410..=430).contains(&image.width),
            "A5 width should be about 420pt, got {}",
            image.width
        );
        assert!(
            (585..=605).contains(&image.height),
            "A5 height should be about 595pt, got {}",
            image.height
        );
    }

    #[test]
    fn render_svg_page_returns_project_paper_size_and_svg_markup() {
        let mut ast = basic_document_ast("A5 page", "");
        ast.metadata.project_settings.paper_size = Some("a5".to_string());

        let mut engine = ErgoPreviewEngine::new();
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");
        let result = engine.compile_preview();
        assert_eq!(result.status, CompilationStatus::Succeeded);

        let page = engine
            .render_svg_page(0)
            .expect("compiled page should render as SVG");

        assert!(
            (410.0..=430.0).contains(&page.width_pt),
            "A5 width should be about 420pt, got {}",
            page.width_pt
        );
        assert!(
            (585.0..=605.0).contains(&page.height_pt),
            "A5 height should be about 595pt, got {}",
            page.height_pt
        );
        assert!(page.svg.starts_with("<svg"));
    }

    #[test]
    fn compile_preview_with_svg_inlines_requested_changed_pages() {
        let ast = basic_document_ast("Inline page", "");

        let mut engine = ErgoPreviewEngine::new();
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");

        // First compile: page 0 is changed, so requesting it inlines its SVG.
        let first = engine.compile_preview_with_svg(&[0]);
        assert_eq!(first.status, CompilationStatus::Succeeded);
        let pages = first
            .preview_pages
            .as_ref()
            .expect("compile should return pages");
        let svg = pages[0]
            .content
            .as_ref()
            .expect("requested changed page should carry inline SVG");
        assert!(svg.starts_with("<svg"));

        // Second compile with no edits: the page is unchanged, so even when
        // requested it is left for the client cache rather than re-rendered.
        let second = engine.compile_preview_with_svg(&[0]);
        let pages = second
            .preview_pages
            .as_ref()
            .expect("compile should return pages");
        assert!(!pages[0].changed);
        assert!(pages[0].content.is_none());
    }

    #[test]
    fn compile_preview_without_indices_omits_inline_svg() {
        let ast = basic_document_ast("No inline", "");

        let mut engine = ErgoPreviewEngine::new();
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");

        let result = engine.compile_preview_with_svg(&[]);
        let pages = result
            .preview_pages
            .as_ref()
            .expect("compile should return pages");
        assert!(pages.iter().all(|page| page.content.is_none()));
    }

    #[test]
    fn reset_for_new_project_clears_vfs_and_page_fingerprints() {
        let mut engine = ErgoPreviewEngine::new();
        engine.write_source("orphan.typ", "stale");
        engine.preview_page_fingerprints = vec![1, 2, 3, 4, 5];

        engine.reset_for_new_project();

        assert!(engine.vfs.read_source("orphan.typ").is_err());
        assert!(engine.preview_page_fingerprints.is_empty());
        assert!(engine.document.is_none());
    }

    #[test]
    fn compile_preview_marks_unchanged_pages_without_rerendering_metadata() {
        let ast = basic_document_ast("Stable page", "");

        let mut engine = ErgoPreviewEngine::new();
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");

        let first = engine.compile_preview();
        assert!(first
            .preview_pages
            .as_ref()
            .expect("first compile should return pages")
            .iter()
            .all(|page| page.changed));

        let second = engine.compile_preview();
        let pages = second
            .preview_pages
            .as_ref()
            .expect("second compile should return pages");
        assert!(pages.iter().all(|page| !page.changed));
        assert!(pages.iter().all(|page| page.width_pt.is_some()));
        assert!(pages.iter().all(|page| page.height_pt.is_some()));
    }

    #[test]
    fn render_page_region_matches_full_render_crop() {
        use crate::profile::load_bundled_template_packages;

        let ast = basic_document_ast("Banded page", "Some body text for the band.");

        let mut engine = ErgoPreviewEngine::new();
        load_bundled_template_packages(&engine);
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");
        let result = engine.compile_preview();
        assert_eq!(result.status, CompilationStatus::Succeeded);

        let ppp = 2.0_f32;
        let full = engine
            .render_page(0, ppp)
            .expect("full page should render");

        // A band covering the top third of the page.
        let band_max_pt = full.height_pt / 3.0;
        let region = engine
            .render_page_region(0, ppp, 0.0, f64::INFINITY, 0.0, band_max_pt)
            .expect("page band should render");

        assert_eq!(region.band_width, full.width, "band width == page width");
        let expected_band_h = (ppp * band_max_pt as f32).round() as u32;
        assert!(
            region.band_height.abs_diff(expected_band_h) <= 1,
            "band height {} should match {expected_band_h}",
            region.band_height
        );
        assert!(
            region.band_height < full.height,
            "a top-third band must be shorter than the full page"
        );
        assert_eq!(region.pixels.len(), (region.band_width * region.band_height * 4) as usize);

        // The band's pixels should equal the top rows of a full render. The full
        // render is premultiplied; the band is straight RGBA. For opaque pixels
        // they match exactly, so compare on a mostly-opaque page by checking that
        // a large majority of band rows are identical to the full render's rows.
        let row_bytes = (full.width * 4) as usize;
        let mut matching_rows = 0u32;
        for row in 0..region.band_height {
            let start = (row * full.width * 4) as usize;
            let band_row = &region.pixels[start..start + row_bytes];
            let full_row = &full.pixels[start..start + row_bytes];
            if band_row == full_row {
                matching_rows += 1;
            }
        }
        assert!(
            matching_rows >= region.band_height * 9 / 10,
            "expected >=90% of band rows to match the full render crop, got {matching_rows}/{}",
            region.band_height
        );

        // A band starting partway down the page (y0 > 0) must show that slice's
        // content, positioned at the band top — not the page top. Compare against
        // the corresponding rows of the full render.
        let mid_min_pt = full.height_pt / 3.0;
        let mid_max_pt = full.height_pt * 2.0 / 3.0;
        let mid = engine
            .render_page_region(0, ppp, 0.0, f64::INFINITY, mid_min_pt, mid_max_pt)
            .expect("middle band should render");
        let y_offset_px = (ppp * mid_min_pt as f32).round() as u32;
        let mut mid_matching = 0u32;
        for row in 0..mid.band_height {
            let band_start = (row * mid.band_width * 4) as usize;
            let full_start = ((row + y_offset_px) * full.width * 4) as usize;
            if full_start + row_bytes > full.pixels.len() {
                break;
            }
            if mid.pixels[band_start..band_start + row_bytes]
                == full.pixels[full_start..full_start + row_bytes]
            {
                mid_matching += 1;
            }
        }
        assert!(
            mid_matching >= mid.band_height * 9 / 10,
            "middle band should match the full render's middle rows, got {mid_matching}/{}",
            mid.band_height
        );

        // Horizontal clipping: a left-half region is narrower than the full page
        // and its rows match the left portion of the full render's rows.
        let left = engine
            .render_page_region(0, ppp, 0.0, full.width_pt / 2.0, 0.0, full.height_pt)
            .expect("left-half region should render");
        assert!(
            left.band_width < full.width,
            "a left-half region must be narrower than the full page"
        );
        let left_row_bytes = (left.band_width * 4) as usize;
        let mut left_matching = 0u32;
        for row in 0..left.band_height {
            let band_start = (row * left.band_width * 4) as usize;
            let full_start = (row * full.width * 4) as usize;
            if band_start + left_row_bytes > left.pixels.len()
                || full_start + left_row_bytes > full.pixels.len()
            {
                break;
            }
            if left.pixels[band_start..band_start + left_row_bytes]
                == full.pixels[full_start..full_start + left_row_bytes]
            {
                left_matching += 1;
            }
        }
        assert!(
            left_matching >= left.band_height * 9 / 10,
            "left-half region should match the full render's left columns, got {left_matching}/{}",
            left.band_height
        );
    }

    #[test]
    fn render_resource_region_compiles_on_demand() {
        use ergo_core::ast::{DocumentElement, DocumentSection, Equation, EquationSyntax};
        use crate::profile::load_bundled_template_packages;

        let mut ast = basic_document_ast("Resource region document", "");
        match &mut ast.sections[0] {
            DocumentSection::Content(content) => {
                content.elements.push(DocumentElement::Equation(Equation {
                    id: "eq-1".to_string(),
                    latex_source: "x^2".to_string(),
                    is_block: false,
                    syntax: EquationSyntax::Typst,
                }));
            }
        }

        let mut engine = ErgoPreviewEngine::new();
        load_bundled_template_packages(&engine);
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");

        // No prior compile_preview: resource band should compile on demand.
        let region = engine
            .render_resource_region(1, 600, 0.0, f64::INFINITY, 0.0, f64::INFINITY)
            .expect("resource band should compile on demand and render");
        assert!(region.band_width > 0 && region.band_height > 0);
        assert_eq!(
            region.pixels.len(),
            (region.band_width * region.band_height * 4) as usize
        );
    }

    #[test]
    fn render_resource_svg_page_compiles_on_demand_before_main_preview() {
        use ergo_core::ast::{DocumentElement, DocumentSection, Equation, EquationSyntax};
        use crate::profile::load_bundled_template_packages;

        let mut ast = basic_document_ast("Resource preview document", "");
        match &mut ast.sections[0] {
            DocumentSection::Content(content) => {
                content.elements.push(DocumentElement::Equation(Equation {
                    id: "eq-1".to_string(),
                    latex_source: "x^2".to_string(),
                    is_block: false,
                    syntax: EquationSyntax::Typst,
                }));
            }
        }

        let mut engine = ErgoPreviewEngine::new();
        load_bundled_template_packages(&engine);
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");

        // Do not call compile_preview first; resource previews should compile
        // on demand when requested by the UI before the main preview completes.
        let page = engine
            .render_resource_svg_page(1)
            .expect("resource preview should compile on demand and render");
        assert!(page.svg.starts_with("<svg"));
    }

    #[test]
    fn render_resource_svg_page_skips_missing_image_assets() {
        use ergo_core::ast::{AssetEntry, DocumentElement, DocumentSection, Equation, EquationSyntax};
        use crate::profile::load_bundled_template_packages;

        let mut ast = basic_document_ast("Resource preview with missing asset", "");
        // An image asset whose file is not in the VFS should not break the
        // resource preview compile for other resources.
        ast.assets.push(AssetEntry {
            id: "missing-image".to_string(),
            path: "assets/image-missing.png".to_string(),
            kind: "image".to_string(),
            caption: Some("Missing image".to_string()),
        });
        match &mut ast.sections[0] {
            DocumentSection::Content(content) => {
                content.elements.push(DocumentElement::Equation(Equation {
                    id: "eq-1".to_string(),
                    latex_source: "x^2".to_string(),
                    is_block: false,
                    syntax: EquationSyntax::Typst,
                }));
            }
        }

        let mut engine = ErgoPreviewEngine::new();
        load_bundled_template_packages(&engine);
        engine
            .sync_snapshot(ast)
            .expect("snapshot sync should succeed");

        // Equation is the first (and only) renderable resource preview; the
        // missing image asset should be skipped, so this should succeed.
        let page = engine
            .render_resource_svg_page(1)
            .expect("renderable resource previews should compile despite missing asset");
        assert!(page.svg.starts_with("<svg"));
    }
}
