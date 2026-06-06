import init, {
    ErgoWasmCompiler,
    append_font_buffers,
    evict_caches,
    reset_fonts_to_bundled,
} from "../wasm-compiler/ergo_engine_wasm.js";
import type { WorkerMessage, WorkerReply } from "./compilerProtocol";

let compiler: ErgoWasmCompiler | null = null;
let initialized = false;

// Sweep Typst's memoization cache only once typing has paused, never on the
// compile hot path: `comemo::evict` walks the whole (large) cache, so doing it
// per compile destroys incremental-compile latency. Each compile reschedules the
// timer, so the sweep fires only after a gap with no compiles.
const IDLE_EVICT_DELAY_MS = 1500;
let idleEvictTimer: ReturnType<typeof setTimeout> | null = null;

const scheduleIdleEvict = () => {
    if (idleEvictTimer !== null) {
        clearTimeout(idleEvictTimer);
    }
    idleEvictTimer = setTimeout(() => {
        idleEvictTimer = null;
        if (initialized) {
            evict_caches();
        }
    }, IDLE_EVICT_DELAY_MS);
};

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
            case "reset_fonts": {
                if (!compiler) return;
                reset_fonts_to_bundled();
                reply({ type: "reset_fonts_done", id });
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
                const compileStarted = performance.now();
                const result = compiler.compile_preview(
                    message.payload.svgPageIndices,
                );
                const compileFinished = performance.now();
                reply({
                    type: "compile_done",
                    result,
                    compileMs: Math.round(compileFinished - compileStarted),
                    id,
                });
                scheduleIdleEvict();
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
                scheduleIdleEvict();
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
                            widthPt: pageImage.widthPt,
                            heightPt: pageImage.heightPt,
                            pixels,
                            requestId,
                        },
                        id,
                    },
                    [pixels.buffer],
                );
                break;
            }
            case "render_svg_page": {
                if (!compiler) return;
                const { pageIndex, requestId } = message.payload;
                const page = compiler.render_svg_page(pageIndex);
                reply({
                    type: "render_svg_done",
                    payload: {
                        pageIndex,
                        widthPt: page.widthPt,
                        heightPt: page.heightPt,
                        svg: page.svg,
                        requestId,
                    },
                    id,
                });
                break;
            }
            case "render_resource_svg_page": {
                if (!compiler) return;
                const { pageNumber, requestId } = message.payload;
                const page = compiler.render_resource_svg_page(pageNumber);
                reply({
                    type: "render_resource_svg_done",
                    payload: {
                        pageIndex: pageNumber,
                        widthPt: page.widthPt,
                        heightPt: page.heightPt,
                        svg: page.svg,
                        requestId,
                    },
                    id,
                });
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
            case "export_pdf": {
                if (!compiler) return;
                const bytes = compiler.export_pdf();
                reply({ type: "export_pdf_done", bytes, id });
                break;
            }
            case "export_png_pages": {
                if (!compiler) return;
                const rawPages = compiler.export_png_pages(message.payload.pixelPerPt);
                const pages: Uint8Array[] = [];
                for (let index = 0; index < rawPages.length; index += 1) {
                    pages.push(rawPages[index] as Uint8Array);
                }
                reply({
                    type: "export_png_pages_done",
                    pages,
                    id,
                });
                break;
            }
            case "export_svg_pages": {
                if (!compiler) return;
                const rawPages = compiler.export_svg_pages();
                const pages: string[] = [];
                for (let index = 0; index < rawPages.length; index += 1) {
                    pages.push(String(rawPages[index]));
                }
                reply({
                    type: "export_svg_pages_done",
                    pages,
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
