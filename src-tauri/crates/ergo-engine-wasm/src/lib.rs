use std::sync::Arc;
use wasm_bindgen::prelude::*;
use typst::layout::PagedDocument;
use typst::foundations::Bytes;
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use parking_lot::RwLock;

use ergo_core::world::{ErgoWorld, WorldSourceSnapshot};
use ergo_core::vfs::VirtualFileSystem;
use ergo_core::document_session::DocumentSession;
use ergo_core::document_session_types::DocumentEvent;
use ergo_core::ast::DocumentAST;
use ergo_core::compilation_types::{CompilationResult, CompilationStatus};
use ergo_core::preview_sync::{PreviewSyncState, PreviewFocusTarget};
use ergo_core::preview_pipeline::{apply_document_events, compile_preview_success};

static CUSTOM_FONTS: RwLock<Option<Arc<Vec<Font>>>> = RwLock::new(None);
static CUSTOM_FONT_BOOK: RwLock<Option<LazyHash<FontBook>>> = RwLock::new(None);

#[wasm_bindgen]
pub fn initialize_fonts(font_buffers: js_sys::Array) {
    console_error_panic_hook::set_once();
    let mut fonts = Vec::new();
    for val in font_buffers.iter() {
        let array: js_sys::Uint8Array = val.into();
        let buf = array.to_vec();
        fonts.extend(Font::iter(Bytes::new(buf)));
    }

    fonts.extend(typst_assets::fonts().flat_map(|font| Font::iter(Bytes::new(font.to_vec()))));

    let mut book = FontBook::new();
    for font in &fonts {
        book.push(font.info().clone());
    }

    *CUSTOM_FONTS.write() = Some(Arc::new(fonts));
    *CUSTOM_FONT_BOOK.write() = Some(LazyHash::new(book));
}

fn get_wasm_fonts() -> Arc<Vec<Font>> {
    let guard = CUSTOM_FONTS.read();
    if let Some(fonts) = &*guard {
        return fonts.clone();
    }
    let fonts: Vec<Font> = typst_assets::fonts()
        .flat_map(|font| Font::iter(Bytes::new(font.to_vec())))
        .collect();
    Arc::new(fonts)
}

fn get_wasm_font_book() -> LazyHash<FontBook> {
    let guard = CUSTOM_FONT_BOOK.read();
    if let Some(book) = &*guard {
        return book.clone();
    }
    let fonts = get_wasm_fonts();
    let mut book = FontBook::new();
    for font in fonts.iter() {
        book.push(font.info().clone());
    }
    LazyHash::new(book)
}

fn preview_world(vfs: Arc<VirtualFileSystem>) -> ErgoWorld {
    ErgoWorld::new_with_fonts(
        vfs,
        ergo_core::path_utils::file_id_for_virtual_path("main.typ"),
        get_wasm_fonts(),
        get_wasm_font_book(),
    )
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmPageImage {
    width: u32,
    height: u32,
    pixels: Vec<u8>,
}

#[wasm_bindgen]
impl WasmPageImage {
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 {
        self.width
    }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.height
    }

    #[wasm_bindgen(getter)]
    pub fn pixels(&self) -> js_sys::Uint8Array {
        js_sys::Uint8Array::from(self.pixels.as_slice())
    }
}

#[wasm_bindgen]
pub struct ErgoWasmCompiler {
    vfs: Arc<VirtualFileSystem>,
    session: DocumentSession,
    document: Option<PagedDocument>,
    sync_state: PreviewSyncState,
}

#[wasm_bindgen]
impl ErgoWasmCompiler {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let vfs = Arc::new(VirtualFileSystem::new());
        let session = DocumentSession::new(Arc::clone(&vfs));
        Self {
            vfs,
            session,
            document: None,
            sync_state: PreviewSyncState::default(),
        }
    }

    #[wasm_bindgen]
    pub fn write_file(&self, path: &str, bytes: &[u8]) {
        self.vfs.write_file(path, bytes.to_vec());
    }

    #[wasm_bindgen]
    pub fn write_source(&self, path: &str, text: &str) {
        self.vfs.write_source(path, text.to_string());
    }

    #[wasm_bindgen]
    pub fn apply_patch(&self, path: &str, start: usize, end: usize, text: &str) -> Result<(), String> {
        self.vfs.apply_patch(path, start, end, text)
    }

    #[wasm_bindgen]
    pub fn sync_document_snapshot(&mut self, ast: JsValue) -> Result<JsValue, JsValue> {
        let ast: DocumentAST = serde_wasm_bindgen::from_value(ast)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let status = self.session.sync_snapshot(ast)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_wasm_bindgen::to_value(&status)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn sync_document_event(&mut self, event: JsValue) -> Result<JsValue, JsValue> {
        let event: DocumentEvent = serde_wasm_bindgen::from_value(event)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let status = self.session.apply_event(event)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        serde_wasm_bindgen::to_value(&status)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn sync_document_events(&mut self, events: JsValue) -> Result<JsValue, JsValue> {
        let events: Vec<DocumentEvent> = serde_wasm_bindgen::from_value(events)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let status = apply_document_events(&mut self.session, events)
            .map_err(|e| JsValue::from_str(&e))?;
        serde_wasm_bindgen::to_value(&status)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn compile_preview(&mut self) -> Result<JsValue, JsValue> {
        let source_revision = self.vfs.latest_revision();
        let world = preview_world(Arc::clone(&self.vfs));

        match compile_preview_success(&world, &self.vfs, &self.session) {
            Ok(success) => {
                let status = self.session.status();
                let source_snapshot = WorldSourceSnapshot::from_vfs(&self.vfs);

                self.sync_state.store_preview(
                    source_revision,
                    success.document.clone(),
                    status.source_map,
                    status.field_source_map,
                    source_snapshot,
                );

                self.document = Some(success.document);

                let result = CompilationResult {
                    source_revision,
                    status: CompilationStatus::Succeeded,
                    preview_pages: Some(success.preview_pages),
                    export_path: None,
                    diagnostics: Vec::new(),
                    outline: Some(success.outline),
                    resources: success.resources,
                };

                serde_wasm_bindgen::to_value(&result)
                    .map_err(|e| JsValue::from_str(&e.to_string()))
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
                serde_wasm_bindgen::to_value(&result)
                    .map_err(|e| JsValue::from_str(&e.to_string()))
            }
        }
    }

    #[wasm_bindgen]
    pub fn render_page(&self, page_index: usize, pixel_per_pt: f32) -> Result<WasmPageImage, JsValue> {
        let doc = self.document.as_ref()
            .ok_or_else(|| JsValue::from_str("No compiled document available"))?;

        let page = doc.pages.get(page_index)
            .ok_or_else(|| JsValue::from_str(&format!("Page index out of bounds: {}", page_index)))?;

        let pixmap = typst_render::render(page, pixel_per_pt);

        Ok(WasmPageImage {
            width: pixmap.width(),
            height: pixmap.height(),
            pixels: pixmap.data().to_vec(),
        })
    }

    #[wasm_bindgen]
    pub fn jump_from_click(
        &self,
        page_number: usize,
        x_pt: f64,
        y_pt: f64,
        source_revision: u64,
    ) -> Result<JsValue, JsValue> {
        let result = self.sync_state.jump_from_click(page_number, x_pt, y_pt, source_revision);
        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn positions_for_focus(
        &self,
        target: JsValue,
        source_revision: u64,
    ) -> Result<JsValue, JsValue> {
        let target: PreviewFocusTarget = serde_wasm_bindgen::from_value(target)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        let result = self.sync_state.positions_for_focus(&target, source_revision);
        serde_wasm_bindgen::to_value(&result)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn export_pdf(&self) -> Result<Vec<u8>, JsValue> {
        let doc = self.document.as_ref()
            .ok_or_else(|| JsValue::from_str("No compiled document available"))?;

        typst_pdf::pdf(doc, &typst_pdf::PdfOptions::default())
            .map_err(|e| JsValue::from_str(&format!("PDF export failed: {:?}", e)))
    }

    #[wasm_bindgen]
    pub fn export_png(&self, page_index: usize, pixel_per_pt: f32) -> Result<Vec<u8>, JsValue> {
        let doc = self.document.as_ref()
            .ok_or_else(|| JsValue::from_str("No compiled document available"))?;

        let page = doc.pages.get(page_index)
            .ok_or_else(|| JsValue::from_str(&format!("Page index out of bounds: {}", page_index)))?;

        let pixmap = typst_render::render(page, pixel_per_pt);
        pixmap.encode_png()
            .map_err(|e| JsValue::from_str(&format!("PNG export failed: {:?}", e)))
    }
}
