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

    BootstrapPreviewPayload,

    BootstrapPreviewResult,

    RenderPagePayload,

    VfsFileEntry,

    WorkerMessage,

    WorkerReply,

    WorkerRequest,

} from "./compilerProtocol";



let globalWorkerPromise: Promise<Worker> | null = null;

let fontsLoadPromise: Promise<void> | null = null;
let loadedFontsKey: string | null = null;

function fontRequirementsKey(ast: DocumentAST): string {
    const settings = ast.metadata.project_settings;
    return [
        settings.text_font ?? "",
        settings.math_font ?? "",
        settings.raw_font ?? "",
    ].join("\0");
}

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



function attachWorkerDispatcher(worker: Worker) {

    worker.onmessage = (event: MessageEvent<WorkerReply>) => {

        dispatchReply(event.data);

    };

}



/** WASM module + compiler instance only (bundled Typst fonts). Does not load OS fonts. */

export function getWorker(): Promise<Worker> {

    if (globalWorkerPromise) {

        return globalWorkerPromise;

    }



    globalWorkerPromise = (async () => {

        const worker = new Worker(

            new URL("./compiler.worker.ts", import.meta.url),

            { type: "module" },

        );



        return new Promise<Worker>((resolve, reject) => {

            const initTimeout = setTimeout(() => {

                reject(new Error("Worker initialization timed out"));

            }, 15000);



            const onInitMessage = (event: MessageEvent<WorkerReply>) => {

                const data = event.data;



                if (data.type === "init_done") {

                    clearTimeout(initTimeout);

                    worker.removeEventListener("message", onInitMessage);

                    attachWorkerDispatcher(worker);

                    resolve(worker);

                    return;

                }



                if (data.type === "error" && data.id === undefined) {

                    clearTimeout(initTimeout);

                    worker.removeEventListener("message", onInitMessage);

                    reject(new Error(data.error));

                }

            };



            worker.addEventListener("message", onInitMessage);



            const initMessage: WorkerMessage = {

                type: "init",

                payload: { wasmUrl },

            };

            worker.postMessage(initMessage);

        });

    })();



    return globalWorkerPromise;

}



/**

 * Loads system fonts into the worker in the background. Compiles can run before this

 * finishes using bundled Typst fonts; call before compile when OS fonts are required.

 */

/** Loads only OS fonts required by the document and not already bundled in WASM. */
export function loadDocumentFontsLazy(ast: DocumentAST): Promise<void> {
    const key = fontRequirementsKey(ast);
    if (loadedFontsKey === key && fontsLoadPromise) {
        return fontsLoadPromise;
    }
    if (loadedFontsKey === key) {
        return Promise.resolve();
    }

    fontsLoadPromise = (async () => {
        try {
            const worker = await getWorker();
            const fonts = await TauriApi.loadFontsForDocument(ast);
            if (fonts.length > 0) {
                const fontBuffers = fonts.map((buffer) => Array.from(buffer));
                await callWorkerOn(
                    worker,
                    { type: "load_fonts", payload: fontBuffers },
                    "load_fonts_done",
                );
            }
            loadedFontsKey = key;
        } catch (error) {
            fontsLoadPromise = null;
            throw error;
        }
    })();

    return fontsLoadPromise;
}



/** Spawns the WASM worker without blocking on OS font discovery. */

export function warmupCompiler(): void {
    void getWorker();
}



async function callWorkerOn<T extends WorkerReply["type"]>(

    worker: Worker,

    request: WorkerRequest,

    expected: T,

): Promise<Extract<WorkerReply, { type: T }>> {

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



async function callWorker<T extends WorkerReply["type"]>(

    request: WorkerRequest,

    expected: T,

): Promise<Extract<WorkerReply, { type: T }>> {

    const worker = await getWorker();

    return callWorkerOn(worker, request, expected);

}



export const CompilerClient = {

    async syncSnapshot(ast: DocumentAST): Promise<DocumentSessionStatus> {

        void loadDocumentFontsLazy(ast);

        const reply = await callWorker(

            { type: "sync_snapshot", payload: ast },

            "sync_done",

        );

        return reply.status;

    },



    async syncEvents(
        ast: DocumentAST,
        events: DocumentEvent[],
    ): Promise<DocumentSessionStatus> {
        void loadDocumentFontsLazy(ast);

        const reply = await callWorker(

            { type: "sync_events", payload: events },

            "sync_done",

        );

        return reply.status;

    },



    async compile(ast: DocumentAST): Promise<CompilationResult> {
        void loadDocumentFontsLazy(ast);

        const reply = await callWorker({ type: "compile" }, "compile_done");

        return reply.result;

    },



    async bootstrap(

        payload: BootstrapPreviewPayload,

    ): Promise<BootstrapPreviewResult> {

        void loadDocumentFontsLazy(payload.ast);

        const reply = await callWorker(

            { type: "bootstrap", payload },

            "bootstrap_done",

        );

        return reply.payload;

    },



    async writeFiles(files: VfsFileEntry[]): Promise<void> {

        await callWorker({ type: "write_files", payload: files }, "write_files_done");

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



    async renderResourcePage(

        pageNumber: number,

        pixelPerPt: number,

        requestId: number,

    ): Promise<RenderPagePayload> {

        const reply = await callWorker(

            {

                type: "render_resource_page",

                payload: { pageNumber, pixelPerPt, requestId },

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



    async exportPdf(ast: DocumentAST): Promise<Uint8Array> {
        await loadDocumentFontsLazy(ast);

        const reply = await callWorker({ type: "export_pdf" }, "export_pdf_done");

        return reply.bytes;

    },



    async exportPng(
        ast: DocumentAST,
        pageIndex: number,
        pixelPerPt: number,
    ): Promise<Uint8Array> {
        await loadDocumentFontsLazy(ast);

        const reply = await callWorker(

            { type: "export_png", payload: { pageIndex, pixelPerPt } },

            "export_png_done",

        );

        return reply.bytes;

    },

};


