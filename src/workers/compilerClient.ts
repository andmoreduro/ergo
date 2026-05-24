import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { PreviewJumpResult } from "../bindings/PreviewJumpResult";
import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";
import type { PreviewElementPositionsResult } from "../bindings/PreviewElementPositionsResult";
import { TauriApi } from "../api/tauri";
import wasmUrl from "../wasm-compiler/ergo_engine_wasm_bg.wasm?url";
import type {
    RenderPagePayload,
    WorkerMessage,
    WorkerReply,
    WorkerRequest,
} from "./compilerProtocol";

let globalWorkerPromise: Promise<Worker> | null = null;
let nextMessageId = 0;

type PendingHandler = {
    resolve: (reply: WorkerReply) => void;
    reject: (error: Error) => void;
};

const pendingMessages = new Map<number, PendingHandler>();

function dispatchReply(data: WorkerReply) {
    if (data.id === undefined) {
        return;
    }
    const pending = pendingMessages.get(data.id);
    if (!pending) {
        return;
    }
    pendingMessages.delete(data.id);
    if (data.type === "error") {
        pending.reject(new Error(data.error));
    } else {
        pending.resolve(data);
    }
}

export function getWorker(): Promise<Worker> {
    if (globalWorkerPromise) {
        return globalWorkerPromise;
    }

    globalWorkerPromise = (async () => {
        const worker = new Worker(
            new URL("./compiler.worker.ts", import.meta.url),
            { type: "module" },
        );

        const fonts = await TauriApi.loadSystemFonts();
        const fontBuffers = Array.from(fonts, (buffer) => Array.from(buffer));

        return new Promise<Worker>((resolve, reject) => {
            const initTimeout = setTimeout(() => {
                reject(new Error("Worker initialization timed out"));
            }, 15000);

            worker.onmessage = (event: MessageEvent<WorkerReply>) => {
                const data = event.data;

                if (data.type === "init_done") {
                    clearTimeout(initTimeout);
                    resolve(worker);
                    return;
                }

                if (data.type === "error" && data.id === undefined) {
                    clearTimeout(initTimeout);
                    reject(new Error(data.error));
                    return;
                }

                dispatchReply(data);
            };

            const initMessage: WorkerMessage = {
                type: "init",
                payload: { wasmUrl, fonts: fontBuffers },
            };
            worker.postMessage(initMessage);
        });
    })();

    return globalWorkerPromise;
}

async function callWorker<T extends WorkerReply["type"]>(
    request: WorkerRequest,
    expected: T,
): Promise<Extract<WorkerReply, { type: T }>> {
    const worker = await getWorker();
    const id = nextMessageId++;
    return new Promise((resolve, reject) => {
        pendingMessages.set(id, {
            resolve: (reply) => {
                if (reply.type === expected) {
                    resolve(reply as Extract<WorkerReply, { type: T }>);
                } else if (reply.type === "error") {
                    reject(new Error(reply.error));
                } else {
                    reject(new Error(`Unexpected worker reply: ${reply.type}`));
                }
            },
            reject,
        });
        const message: WorkerMessage = { ...request, id };
        worker.postMessage(message);
    });
}

export const CompilerClient = {
    async syncSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {
        const reply = await callWorker(
            { type: "sync_snapshot", payload: ast },
            "sync_done",
        );
        return reply.status;
    },

    async syncEvents(events: DocumentEvent[]): Promise<DocumentSessionStatus> {
        const reply = await callWorker(
            { type: "sync_events", payload: events },
            "sync_done",
        );
        return reply.status;
    },

    async compile(): Promise<CompilationResult> {
        const reply = await callWorker({ type: "compile" }, "compile_done");
        return reply.result;
    },

    async renderPage(
        pageIndex: number,
        pixelPerPt: number,
        requestId: number,
    ): Promise<RenderPagePayload> {
        const reply = await callWorker(
            {
                type: "render_page",
                payload: { pageIndex, pixelPerPt, requestId },
            },
            "render_done",
        );
        return reply.payload;
    },

    async writeFile(path: string, bytes: Uint8Array): Promise<void> {
        await callWorker({ type: "write_file", payload: { path, bytes } }, "write_file_done");
    },

    async writeSource(path: string, text: string): Promise<void> {
        await callWorker({ type: "write_source", payload: { path, text } }, "write_source_done");
    },

    async applyPatch(
        path: string,
        start: number,
        end: number,
        text: string,
    ): Promise<void> {
        await callWorker(
            { type: "apply_patch", payload: { path, start, end, text } },
            "apply_patch_done",
        );
    },

    async jumpFromClick(
        pageNumber: number,
        xPt: number,
        yPt: number,
        sourceRevision: number,
    ): Promise<PreviewJumpResult> {
        const reply = await callWorker(
            {
                type: "jump_from_click",
                payload: { pageNumber, xPt, yPt, sourceRevision },
            },
            "jump_done",
        );
        return reply.result;
    },

    async positionsForFocus(
        target: PreviewFocusTarget,
        sourceRevision: number,
    ): Promise<PreviewElementPositionsResult> {
        const reply = await callWorker(
            {
                type: "positions_for_focus",
                payload: { target, sourceRevision },
            },
            "positions_done",
        );
        return reply.result;
    },

    async exportPdf(): Promise<Uint8Array> {
        const reply = await callWorker({ type: "export_pdf" }, "export_pdf_done");
        return reply.bytes;
    },

    async exportPng(pageIndex: number, pixelPerPt: number): Promise<Uint8Array> {
        const reply = await callWorker(
            { type: "export_png", payload: { pageIndex, pixelPerPt } },
            "export_png_done",
        );
        return reply.bytes;
    },
};
