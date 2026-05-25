import init, { ErgoWasmCompiler, append_font_buffers } from "../wasm-compiler/ergo_engine_wasm.js";
import type { WorkerMessage, WorkerReply } from "./compilerProtocol";

let compiler: ErgoWasmCompiler | null = null;
let initialized = false;

const workerScope = self as unknown as {
    postMessage: (message: WorkerReply, transfer?: Transferable[]) => void;
    onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
};

const reply = (message: WorkerReply, transfer?: Transferable[]) => {
    if (transfer && transfer.length > 0) {
        workerScope.postMessage(message, transfer);
    } else {
        workerScope.postMessage(message);
    }
};

const replyError = (id: number | undefined, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    reply({ type: "error", error: message, id });
};

workerScope.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    const id = message.id;

    try {
        switch (message.type) {
            case "init": {
                if (!initialized) {
                    const { wasmUrl } = message.payload;
                    await init({ module_or_path: wasmUrl });
                    compiler = new ErgoWasmCompiler();
                    initialized = true;
                }
                reply({ type: "init_done", id });
                break;
            }
            case "load_fonts": {
                if (!compiler) return;
                append_font_buffers(message.payload);
                reply({ type: "load_fonts_done", id });
                break;
            }
            case "sync_snapshot": {
                if (!compiler) return;
                const status = compiler.sync_document_snapshot(message.payload);
                reply({ type: "sync_done", status, id });
                break;
            }
            case "sync_events": {
                if (!compiler) return;
                const status = compiler.sync_document_events(message.payload);
                reply({ type: "sync_done", status, id });
                break;
            }
            case "compile": {
                if (!compiler) return;
                const result = compiler.compile_preview();
                reply({ type: "compile_done", result, id });
                break;
            }
            case "bootstrap": {
                if (!compiler) return;
                const bootstrapResult = compiler.bootstrap_preview({
                    ast: message.payload.ast,
                    files: message.payload.files.map((file) => ({
                        path: file.path,
                        bytes: Array.from(file.bytes),
                    })),
                });
                reply({ type: "bootstrap_done", payload: bootstrapResult, id });
                break;
            }
            case "render_page": {
                if (!compiler) return;
                const { pageIndex, pixelPerPt, requestId } = message.payload;
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
            case "render_resource_page": {
                if (!compiler) return;
                const { pageNumber, pixelPerPt, requestId } = message.payload;
                const pageImage = compiler.render_resource_page(pageNumber, pixelPerPt);
                const pixels = pageImage.pixels;
                reply(
                    {
                        type: "render_done",
                        payload: {
                            pageIndex: pageNumber,
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
                compiler.write_file(
                    message.payload.path,
                    new Uint8Array(message.payload.bytes),
                );
                reply({ type: "write_file_done", id });
                break;
            }
            case "write_files": {
                if (!compiler) return;
                compiler.write_files(
                    message.payload.map((file) => ({
                        path: file.path,
                        bytes: Array.from(file.bytes),
                    })),
                );
                reply({ type: "write_files_done", id });
                break;
            }
            case "write_source": {
                if (!compiler) return;
                compiler.write_source(message.payload.path, message.payload.text);
                reply({ type: "write_source_done", id });
                break;
            }
            case "apply_patch": {
                if (!compiler) return;
                compiler.apply_patch(
                    message.payload.path,
                    message.payload.start,
                    message.payload.end,
                    message.payload.text,
                );
                reply({ type: "apply_patch_done", id });
                break;
            }
            case "jump_from_click": {
                if (!compiler) return;
                const result = compiler.jump_from_click(
                    message.payload.pageNumber,
                    message.payload.xPt,
                    message.payload.yPt,
                    BigInt(message.payload.sourceRevision),
                );
                reply({ type: "jump_done", result, id });
                break;
            }
            case "positions_for_focus": {
                if (!compiler) return;
                const result = compiler.positions_for_focus(
                    message.payload.target,
                    BigInt(message.payload.sourceRevision),
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
                    message.payload.pageIndex,
                    message.payload.pixelPerPt,
                );
                reply({
                    type: "export_png_done",
                    bytes,
                    pageIndex: message.payload.pageIndex,
                    id,
                });
                break;
            }
            case "export_svg": {
                if (!compiler) return;
                const svg = compiler.export_svg(message.payload.pageIndex);
                reply({
                    type: "export_svg_done",
                    svg,
                    pageIndex: message.payload.pageIndex,
                    id,
                });
                break;
            }
            default:
                replyError(id, `Unknown worker message type`);
        }
    } catch (err) {
        replyError(id, err);
    }
};
