let activeDocumentSync: Promise<void> = Promise.resolve();
let flushBackendMirror: (() => Promise<void>) | null = null;

export const setActiveDocumentSync = (sync: Promise<void>) => {
    activeDocumentSync = sync.catch(() => undefined);
};

/** Registers a flush that mirrors the latest AST into the Tauri backend VFS (for save). */
export const registerBackendMirrorFlush = (fn: (() => Promise<void>) | null) => {
    flushBackendMirror = fn;
};

/** Waits for the in-flight WASM sync/compile, then flushes the backend mirror when dirty. */
export const waitForDocumentSync = async (): Promise<void> => {
    await activeDocumentSync;
    if (flushBackendMirror) {
        await flushBackendMirror();
    }
};
