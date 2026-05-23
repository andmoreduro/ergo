import type { CompilationResult } from "../bindings/CompilationResult";

export const getPreviewPageUrl = (path: string, revision: number): string => {
    const isWindows = navigator.userAgent.toLowerCase().includes("win");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    if (isWindows) {
        return `http://ergo-preview.localhost${normalizedPath}?rev=${revision}`;
    } else {
        return `ergo-preview://localhost${normalizedPath}?rev=${revision}`;
    }
};

export const loadChangedPreviewSvgs = async (
    result: CompilationResult,
    currentSvgs: string[],
): Promise<string[]> => {
    const previewPages = result.preview_pages ?? [];
    if (previewPages.length === 0) {
        return [];
    }

    return Promise.all(
        previewPages.map(async (page) => {
            const current = currentSvgs[page.page_number - 1];
            if (!page.changed && current) {
                return current;
            }

            if (page.content) {
                return page.content;
            }

            const response = await fetch(getPreviewPageUrl(page.path, result.source_revision));
            if (!response.ok) {
                throw new Error(`Failed to fetch preview SVG: ${response.statusText}`);
            }
            return response.text();
        }),
    );
};
