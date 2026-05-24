import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { PreviewJumpResult } from "../bindings/PreviewJumpResult";
import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";
import type { PreviewElementPositionsResult } from "../bindings/PreviewElementPositionsResult";
import { TauriApi } from "../api/tauri";
import wasmUrl from "../wasm-compiler/ergo_engine_wasm_bg.wasm?url";

let globalWorkerPromise: Promise<Worker> | null = null;
let nextMessageId = 0;
const pendingMessages = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

export function getWorker(): Promise<Worker> {
    if (globalWorkerPromise) {
        return globalWorkerPromise;
    }

    globalWorkerPromise = (async () => {
        const worker = new Worker(
            new URL("./compiler.worker.ts", import.meta.url),
            { type: "module" }
        );

        // Load system fonts from Tauri
        const fonts = await TauriApi.loadSystemFonts();

        return new Promise<Worker>((resolve, reject) => {
            const initTimeout = setTimeout(() => {
                reject(new Error("Worker initialization timed out"));
            }, 15000);

            worker.onmessage = (e) => {
                const { type, id, status, result, error, payload } = e.data;

                if (type === "init_done") {
                    clearTimeout(initTimeout);
                    resolve(worker);
                    return;
                }

                if (type === "error" && id === undefined) {
                    clearTimeout(initTimeout);
                    reject(new Error(error || "Failed to initialize worker"));
                    return;
                }

                if (id !== undefined) {
                    const pending = pendingMessages.get(id);
                    if (pending) {
                        pendingMessages.delete(id);
                        if (type === "error" || error) {
                            pending.reject(new Error(error || "Worker error"));
                        } else {
                            pending.resolve(payload !== undefined ? payload : (result !== undefined ? result : status));
                        }
                    }
                }
            };

            worker.postMessage({
                type: "init",
                payload: {
                    wasmUrl,
                    fonts,
                },
            });
        });
    })();

    return globalWorkerPromise;
}

export async function callWorker(type: string, payload?: any): Promise<any> {
    const worker = await getWorker();
    const id = nextMessageId++;
    return new Promise((resolve, reject) => {
        pendingMessages.set(id, { resolve, reject });
        worker.postMessage({ type, payload, id });
    });
}

// Client helper functions
export const CompilerClient = {
    async syncSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        return callWorker("sync_snapshot", ast);
    },

    async syncEvent(event: DocumentEvent): Promise<DocumentSessionStatus> {
        return callWorker("sync_event", event);
    },

    async compile(): Promise<CompilationResult> {
        return callWorker("compile");
    },

    async renderPage(pageIndex: number, pixelPerPt: number, requestId: number): Promise<{
        pageIndex: number;
        width: number;
        height: number;
        pixels: Uint8Array;
        requestId: number;
    }> {
        return callWorker("render_page", { pageIndex, pixelPerPt, requestId });
    },

    async writeFile(path: string, bytes: Uint8Array): Promise<void> {
        await callWorker("write_file", { path, bytes });
    },

    async writeSource(path: string, text: string): Promise<void> {
        await callWorker("write_source", { path, text });
    },

    async applyPatch(path: string, start: number, end: number, text: string): Promise<void> {
        await callWorker("apply_patch", { path, start, end, text });
    },

    async jumpFromClick(pageNumber: number, xPt: number, yPt: number, sourceRevision: number): Promise<PreviewJumpResult> {
        return callWorker("jump_from_click", { pageNumber, xPt, yPt, sourceRevision });
    },

    async positionsForFocus(target: PreviewFocusTarget, sourceRevision: number): Promise<PreviewElementPositionsResult> {
        return callWorker("positions_for_focus", { target, sourceRevision });
    },

    async exportPdf(): Promise<Uint8Array> {
        return callWorker("export_pdf");
    },

    async exportPng(pageIndex: number, pixelPerPt: number): Promise<Uint8Array> {
        return callWorker("export_png", { pageIndex, pixelPerPt });
    },
};
