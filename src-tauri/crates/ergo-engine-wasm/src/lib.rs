mod engine;
mod profile;

pub use engine::{BootstrapPreviewOutput, ErgoPreviewEngine, PageImage, PageSvg, VfsFileEntry};
pub use profile::{
    run_wasm_preview_profile, WasmPreviewIteration, WasmPreviewProfileOptions,
    WasmPreviewProfileReport, WasmPreviewScenario, WasmPreviewTiming,
};

use wasm_bindgen::prelude::*;

use ergo_core::ast::DocumentAST;
use ergo_core::document_session_types::DocumentEvent;
use ergo_core::preview_sync::PreviewFocusTarget;

use engine::ErgoPreviewEngine as Engine;
use engine::PageImage as EnginePageImage;
use engine::PageSvg as EnginePageSvg;

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmPageImage {
    width: u32,
    height: u32,
    width_pt: f64,
    height_pt: f64,
    pixels: Vec<u8>,
}

impl From<EnginePageImage> for WasmPageImage {
    fn from(image: EnginePageImage) -> Self {
        Self {
            width: image.width,
            height: image.height,
            width_pt: image.width_pt,
            height_pt: image.height_pt,
            pixels: image.pixels,
        }
    }
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

    #[wasm_bindgen(getter, js_name = widthPt)]
    pub fn width_pt(&self) -> f64 {
        self.width_pt
    }

    #[wasm_bindgen(getter, js_name = heightPt)]
    pub fn height_pt(&self) -> f64 {
        self.height_pt
    }

    #[wasm_bindgen(getter)]
    pub fn pixels(&self) -> js_sys::Uint8Array {
        js_sys::Uint8Array::from(self.pixels.as_slice())
    }
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct WasmPageSvg {
    width_pt: f64,
    height_pt: f64,
    svg: String,
}

impl From<EnginePageSvg> for WasmPageSvg {
    fn from(page: EnginePageSvg) -> Self {
        Self {
            width_pt: page.width_pt,
            height_pt: page.height_pt,
            svg: page.svg,
        }
    }
}

#[wasm_bindgen]
impl WasmPageSvg {
    #[wasm_bindgen(getter, js_name = widthPt)]
    pub fn width_pt(&self) -> f64 {
        self.width_pt
    }

    #[wasm_bindgen(getter, js_name = heightPt)]
    pub fn height_pt(&self) -> f64 {
        self.height_pt
    }

    #[wasm_bindgen(getter)]
    pub fn svg(&self) -> String {
        self.svg.clone()
    }
}

#[wasm_bindgen]
pub struct ErgoWasmCompiler {
    engine: Engine,
}

#[wasm_bindgen]
impl ErgoWasmCompiler {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            engine: Engine::new(),
        }
    }

    #[wasm_bindgen]
    pub fn write_file(&self, path: &str, bytes: &[u8]) {
        self.engine.write_file(path, bytes);
    }

    #[wasm_bindgen]
    pub fn write_files(&self, files: JsValue) -> Result<(), JsValue> {
        let files: Vec<engine::VfsFileEntry> = serde_wasm_bindgen::from_value(files)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        self.engine.write_vfs_files(files);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn write_source(&self, path: &str, text: &str) {
        self.engine.write_source(path, text);
    }

    #[wasm_bindgen]
    pub fn apply_patch(
        &self,
        path: &str,
        start: usize,
        end: usize,
        text: &str,
    ) -> Result<(), String> {
        self.engine.apply_patch(path, start, end, text)
    }

    #[wasm_bindgen]
    pub fn sync_document_snapshot(&mut self, ast: JsValue) -> Result<JsValue, JsValue> {
        let ast: DocumentAST = serde_wasm_bindgen::from_value(ast)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let status = self
            .engine
            .sync_snapshot(ast)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&status).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen]
    pub fn sync_document_event(&mut self, event: JsValue) -> Result<JsValue, JsValue> {
        let event: DocumentEvent = serde_wasm_bindgen::from_value(event)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let status = self
            .engine
            .apply_event(event)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&status).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen]
    pub fn sync_document_events(&mut self, events: JsValue) -> Result<JsValue, JsValue> {
        let events: Vec<DocumentEvent> = serde_wasm_bindgen::from_value(events)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let status = self
            .engine
            .sync_events(events)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&status).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen]
    pub fn compile_preview(&mut self, svg_page_indices: JsValue) -> Result<JsValue, JsValue> {
        let indices: Vec<usize> = if svg_page_indices.is_undefined() || svg_page_indices.is_null() {
            Vec::new()
        } else {
            serde_wasm_bindgen::from_value(svg_page_indices)
                .map_err(|error| JsValue::from_str(&error.to_string()))?
        };
        let result = self.engine.compile_preview_with_svg(&indices);
        serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen]
    pub fn bootstrap_preview(&mut self, input: JsValue) -> Result<JsValue, JsValue> {
        #[derive(serde::Deserialize)]
        struct BootstrapPreviewInput {
            ast: DocumentAST,
            #[serde(default)]
            files: Vec<engine::VfsFileEntry>,
        }

        let input: BootstrapPreviewInput = serde_wasm_bindgen::from_value(input)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let output = self
            .engine
            .bootstrap_preview(input.ast, input.files)
            .map_err(|error| JsValue::from_str(&error))?;
        serde_wasm_bindgen::to_value(&output).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen]
    pub fn render_page(
        &self,
        page_index: usize,
        pixel_per_pt: f32,
    ) -> Result<WasmPageImage, JsValue> {
        self.engine
            .render_page(page_index, pixel_per_pt)
            .map(WasmPageImage::from)
            .map_err(|error| JsValue::from_str(&error))
    }

    #[wasm_bindgen]
    pub fn render_svg_page(&self, page_index: usize) -> Result<WasmPageSvg, JsValue> {
        self.engine
            .render_svg_page(page_index)
            .map(WasmPageSvg::from)
            .map_err(|error| JsValue::from_str(&error))
    }

    #[wasm_bindgen]
    pub fn render_resource_svg_page(&self, page_number: usize) -> Result<WasmPageSvg, JsValue> {
        self.engine
            .render_resource_svg_page(page_number)
            .map(WasmPageSvg::from)
            .map_err(|error| JsValue::from_str(&error))
    }

    #[wasm_bindgen]
    pub fn jump_from_click(
        &self,
        page_number: usize,
        x_pt: f64,
        y_pt: f64,
        source_revision: u64,
    ) -> Result<JsValue, JsValue> {
        let result = self
            .engine
            .jump_from_click(page_number, x_pt, y_pt, source_revision);
        serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen]
    pub fn positions_for_focus(
        &self,
        target: JsValue,
        source_revision: u64,
    ) -> Result<JsValue, JsValue> {
        let target: PreviewFocusTarget = serde_wasm_bindgen::from_value(target)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let result = self.engine.positions_for_focus(&target, source_revision);
        serde_wasm_bindgen::to_value(&result).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen]
    pub fn export_pdf(&mut self) -> Result<Vec<u8>, JsValue> {
        self.engine
            .export_pdf()
            .map_err(|error| JsValue::from_str(&error))
    }

    #[wasm_bindgen]
    pub fn export_png_pages(&mut self, pixel_per_pt: f32) -> Result<js_sys::Array, JsValue> {
        let pages = self
            .engine
            .export_all_png(pixel_per_pt)
            .map_err(|error| JsValue::from_str(&error))?;
        let array = js_sys::Array::new();
        for bytes in pages {
            array.push(&js_sys::Uint8Array::from(bytes.as_slice()));
        }
        Ok(array)
    }

    #[wasm_bindgen]
    pub fn export_svg_pages(&mut self) -> Result<js_sys::Array, JsValue> {
        let pages = self
            .engine
            .export_all_svg()
            .map_err(|error| JsValue::from_str(&error))?;
        let array = js_sys::Array::new();
        for svg in pages {
            array.push(&JsValue::from_str(&svg));
        }
        Ok(array)
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn reset_fonts_to_bundled() {
    engine::reset_fonts_to_bundled();
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn append_font_buffers(font_buffers: js_sys::Array) {
    engine::append_font_buffers(font_buffers);
}
