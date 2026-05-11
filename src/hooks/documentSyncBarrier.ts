let activeDocumentSync: Promise<void> = Promise.resolve();

export const setActiveDocumentSync = (sync: Promise<void>) => {
    activeDocumentSync = sync.catch(() => undefined);
};

export const waitForDocumentSync = (): Promise<void> => activeDocumentSync;
