import type { DocumentAST } from "../bindings/DocumentAST";

let activeDocumentSync: Promise<void> = Promise.resolve();
let flushBackendMirror: (() => Promise<DocumentAST | null>) | null = null;

export const setActiveDocumentSync = (sync: Promise<void>) => {
    activeDocumentSync = sync.catch(() => undefined);
};

/**
 * Registers a flush that mirrors the latest AST into the Tauri backend VFS (for
 * save). The flush resolves with the AST object the backend now holds, so the
 * caller can mark exactly that state as saved.
 */
export const registerBackendMirrorFlush = (
    fn: (() => Promise<DocumentAST | null>) | null,
) => {
    flushBackendMirror = fn;
};

/**
 * Waits for the in-flight WASM sync/compile, then flushes the backend mirror
 * when it is behind. Resolves with the mirrored AST (what a subsequent
 * `save_project` persists), or `null` when no mirror is registered.
 */
export const waitForDocumentSync = async (): Promise<DocumentAST | null> => {
    await activeDocumentSync;
    if (flushBackendMirror) {
        return flushBackendMirror();
    }
    return null;
};
