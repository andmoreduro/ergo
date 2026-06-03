import type { DocumentAST } from "../bindings/DocumentAST";
import { TauriApi } from "../api/tauri";
import wasmUrl from "../wasm-compiler/ergo_engine_wasm_bg.wasm?url";
import type {
    WorkerMessage,
    WorkerReply,
    WorkerRequest,
} from "./compilerProtocol";

let globalWorkerPromise: Promise<Worker> | null = null;
let fontsLoadPromise: Promise<void> | null = null;
let loadedFontsKey: string | null = null;
let loadingFontsKey: string | null = null;

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
 * Loads non-bundled project fonts into the WASM worker (keyed by text/math/raw settings).
 * Intended to run once when a project is opened (`CompilerClient.bootstrap`).
 */
export function loadDocumentFontsLazy(ast: DocumentAST): Promise<void> {
    const key = fontRequirementsKey(ast);
    if (loadedFontsKey === key) {
        return fontsLoadPromise ?? Promise.resolve();
    }
    // A load for this exact font set is already in flight — share the one promise.
    if (loadingFontsKey === key && fontsLoadPromise) {
        return fontsLoadPromise;
    }

    loadingFontsKey = key;
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
            // Allow the next call to retry this font set.
            if (loadingFontsKey === key) {
                fontsLoadPromise = null;
            }
            throw error;
        } finally {
            if (loadingFontsKey === key) {
                loadingFontsKey = null;
            }
        }
    })();

    return fontsLoadPromise;
}

/** Clears the per-session font load cache (call when opening a new project). */
export function resetDocumentFontsCache(): void {
    loadedFontsKey = null;
    loadingFontsKey = null;
    fontsLoadPromise = null;
}

/** Spawns the WASM worker without blocking on OS font discovery. */
export function warmupCompiler(): void {
    void getWorker();
}

export async function callWorkerOn<T extends WorkerReply["type"]>(
    worker: Worker,
    request: WorkerRequest,
    expected: T,
    transfer?: Transferable[],
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
        worker.postMessage(message, transfer ?? []);
    });
}

export async function callWorker<T extends WorkerReply["type"]>(
    request: WorkerRequest,
    expected: T,
    transfer?: Transferable[],
): Promise<Extract<WorkerReply, { type: T }>> {
    const worker = await getWorker();
    return callWorkerOn(worker, request, expected, transfer);
}
