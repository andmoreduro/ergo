import init, { ErgoWasmCompiler, initialize_fonts } from "../wasm-compiler/ergo_engine_wasm.js";
import type { WorkerMessage, WorkerReply } from "./compilerProtocol";

let compiler: ErgoWasmCompiler | null = null;
let initialized = false;

const reply = (message: WorkerReply, transfer?: Transferable[]) => {
    if (transfer && transfer.length > 0) {
        self.postMessage(message, transfer);
    } else {
        self.postMessage(message);
    }
};

const replyError = (id: number | undefined, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    reply({ type: "error", error: message, id });
};

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const { type, payload, id } = event.data;

    try {
        switch (type) {
            case "init": {
                if (!initialized) {
                    const { wasmUrl, fonts } = payload;
                    await init({ module_or_path: wasmUrl });
                    if (fonts.length > 0) {
                        initialize_fonts(fonts);
                    }
                    compiler = new ErgoWasmCompiler();
                    initialized = true;
                }
                reply({ type: "init_done", id });
                break;
            }
            case "sync_snapshot": {
                if (!compiler) return;
                const status = compiler.sync_document_snapshot(payload);
                reply({ type: "sync_done", status, id });
                break;
            }
            case "sync_events": {
                if (!compiler) return;
                const status = compiler.sync_document_events(payload);
                reply({ type: "sync_done", status, id });
                break;
            }
            case "compile": {
                if (!compiler) return;
                const result = compiler.compile_preview();
                reply({ type: "compile_done", result, id });
                break;
            }
            case "render_page": {
                if (!compiler) return;
                const { pageIndex, pixelPerPt, requestId } = payload;
                const pageImage = compiler.render_page(pageIndex, pixelPerPt);
                const pixels = pageImage.pixels;
                reply(
                    {
                        type: "render_done",
                        payload: {
                            pageIndex,
                            width: pageImage.width,
                            height: pageImage.height,
                            pixels,
                            requestId,
                        },
                        id,
                    },
                    [pixels.buffer],
                );
                break;
            }
            case "write_file": {
                if (!compiler) return;
                compiler.write_file(payload.path, new Uint8Array(payload.bytes));
                reply({ type: "write_file_done", id });
                break;
            }
            case "write_source": {
                if (!compiler) return;
                compiler.write_source(payload.path, payload.text);
                reply({ type: "write_source_done", id });
                break;
            }
            case "apply_patch": {
                if (!compiler) return;
                compiler.apply_patch(
                    payload.path,
                    payload.start,
                    payload.end,
                    payload.text,
                );
                reply({ type: "apply_patch_done", id });
                break;
            }
            case "jump_from_click": {
                if (!compiler) return;
                const result = compiler.jump_from_click(
                    payload.pageNumber,
                    payload.xPt,
                    payload.yPt,
                    BigInt(payload.sourceRevision),
                );
                reply({ type: "jump_done", result, id });
                break;
            }
            case "positions_for_focus": {
                if (!compiler) return;
                const result = compiler.positions_for_focus(
                    payload.target,
                    BigInt(payload.sourceRevision),
                );
                reply({ type: "positions_done", result, id });
                break;
            }
            case "export_pdf": {
                if (!compiler) return;
                const bytes = compiler.export_pdf();
                reply({ type: "export_pdf_done", bytes, id });
                break;
            }
            case "export_png": {
                if (!compiler) return;
                const bytes = compiler.export_png(
                    payload.pageIndex,
                    payload.pixelPerPt,
                );
                reply({ type: "export_png_done", bytes, pageIndex: payload.pageIndex, id });
                break;
            }
            default:
                replyError(id, `Unknown worker message type`);
        }
    } catch (err) {
        replyError(id, err);
    }
};
