import init, { ErgoWasmCompiler, initialize_fonts } from "../wasm-compiler/ergo_engine_wasm.js";

let compiler: ErgoWasmCompiler | null = null;
let initialized = false;

self.onmessage = async (event: MessageEvent) => {
    const { type, payload, id } = event.data;

    switch (type) {
        case "init": {
            try {
                if (!initialized) {
                    const { wasmUrl, fonts } = payload;
                    await init({ module_or_path: wasmUrl });
                    if (fonts && fonts.length > 0) {
                        initialize_fonts(fonts);
                    }
                    compiler = new ErgoWasmCompiler();
                    initialized = true;
                }
                self.postMessage({ type: "init_done", id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: "Failed to initialize compiler worker: " + err.message, id });
            }
            break;
        }
        case "sync_snapshot": {
            if (!compiler) return;
            try {
                const status = compiler.sync_document_snapshot(payload);
                self.postMessage({ type: "sync_done", status, id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "sync_event": {
            if (!compiler) return;
            try {
                const status = compiler.sync_document_event(payload);
                self.postMessage({ type: "sync_done", status, id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "compile": {
            if (!compiler) return;
            try {
                const result = compiler.compile_preview();
                self.postMessage({ type: "compile_done", result, id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "render_page": {
            if (!compiler) return;
            try {
                const { pageIndex, pixelPerPt, requestId } = payload;
                const pageImage = compiler.render_page(pageIndex, pixelPerPt);
                const pixels = pageImage.pixels; // Uint8Array
                const buffer = pixels.buffer; // ArrayBuffer
                
                (self as any).postMessage(
                    {
                        type: "render_done",
                        payload: {
                            pageIndex,
                            width: pageImage.width,
                            height: pageImage.height,
                            pixels,
                            requestId,
                        },
                        id
                    },
                    [buffer]
                );
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "write_file": {
            if (!compiler) return;
            const { path, bytes } = payload;
            try {
                compiler.write_file(path, new Uint8Array(bytes));
                self.postMessage({ type: "write_file_done", id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "write_source": {
            if (!compiler) return;
            const { path, text } = payload;
            try {
                compiler.write_source(path, text);
                self.postMessage({ type: "write_source_done", id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "apply_patch": {
            if (!compiler) return;
            const { path, start, end, text } = payload;
            try {
                compiler.apply_patch(path, start, end, text);
                self.postMessage({ type: "apply_patch_done", id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "jump_from_click": {
            if (!compiler) return;
            const { pageNumber, xPt, yPt, sourceRevision } = payload;
            try {
                const result = compiler.jump_from_click(pageNumber, xPt, yPt, BigInt(sourceRevision));
                self.postMessage({ type: "jump_done", result, id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "positions_for_focus": {
            if (!compiler) return;
            const { target, sourceRevision } = payload;
            try {
                const result = compiler.positions_for_focus(target, BigInt(sourceRevision));
                self.postMessage({ type: "positions_done", result, id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "export_pdf": {
            if (!compiler) return;
            try {
                const bytes = compiler.export_pdf();
                self.postMessage({ type: "export_pdf_done", bytes, id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
        case "export_png": {
            if (!compiler) return;
            const { pageIndex, pixelPerPt } = payload;
            try {
                const bytes = compiler.export_png(pageIndex, pixelPerPt);
                self.postMessage({ type: "export_png_done", bytes, pageIndex, id });
            } catch (err: any) {
                self.postMessage({ type: "error", error: err.message, id });
            }
            break;
        }
    }
};
