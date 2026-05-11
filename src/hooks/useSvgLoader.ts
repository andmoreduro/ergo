import { TauriApi } from "../api/tauri";
import type { CompilationResult } from "../bindings/CompilationResult";

export const loadChangedPreviewSvgs = async (
    result: CompilationResult,
    currentSvgs: string[],
): Promise<string[]> => {
    const previewPages = result.preview_pages ?? [];
    if (previewPages.length === 0) {
        return [];
    }

    return Promise.all(
        previewPages.map((page) => {
            const current = currentSvgs[page.page_number - 1];
            if (!page.changed && current) {
                return current;
            }

            return TauriApi.readPreviewSvg(page.path);
        }),
    );
};
