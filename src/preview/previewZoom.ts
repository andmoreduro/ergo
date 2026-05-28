export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 3;
export const PREVIEW_ZOOM_STEP = 0.1;
/** Internal zoom factor shown as 100% in the preview toolbar. */
export const PREVIEW_ZOOM_UI_BASE = 1;
export const PREVIEW_ZOOM_DEFAULT = PREVIEW_ZOOM_UI_BASE;
export const PREVIEW_FIT_GAP_PX = 24;

export function clampPreviewZoom(zoom: number): number {
    return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, zoom));
}

export function stepPreviewZoom(current: number, direction: 1 | -1): number {
    const next =
        Math.round((current + direction * PREVIEW_ZOOM_STEP) * 100) / 100;
    return clampPreviewZoom(next);
}

export function formatPreviewZoomPercent(zoom: number): number {
    return Math.round((zoom / PREVIEW_ZOOM_UI_BASE) * 100);
}

export type PreviewZoomMode = "manual" | "fit-width" | "fit-height";

export type PreviewPageSize = {
    widthPt: number;
    heightPt: number;
};

const CSS_PX_PER_PT = 96 / 72;

function finitePositive(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function fitPreviewZoomForPageWidth(
    viewportWidthPx: number,
    page: PreviewPageSize,
    gapPx = PREVIEW_FIT_GAP_PX,
): number {
    const availableWidth = finitePositive(viewportWidthPx - gapPx, 0);
    const pageWidth = finitePositive(page.widthPt * CSS_PX_PER_PT, 0);
    if (availableWidth <= 0 || pageWidth <= 0) {
        return 1;
    }
    return availableWidth / pageWidth;
}

export function fitPreviewZoomForPageHeight(
    viewportHeightPx: number,
    page: PreviewPageSize,
    gapPx = PREVIEW_FIT_GAP_PX,
): number {
    const availableHeight = finitePositive(viewportHeightPx - gapPx, 0);
    const pageHeight = finitePositive(page.heightPt * CSS_PX_PER_PT, 0);
    if (availableHeight <= 0 || pageHeight <= 0) {
        return 1;
    }
    return availableHeight / pageHeight;
}

export function largestPreviewPageByWidth(
    pages: PreviewPageSize[],
): PreviewPageSize | null {
    return pages.reduce<PreviewPageSize | null>((largest, page) => {
        if (!Number.isFinite(page.widthPt) || page.widthPt <= 0) {
            return largest;
        }
        if (!largest || page.widthPt > largest.widthPt) {
            return page;
        }
        return largest;
    }, null);
}

export function layoutZoomForManualPreviewZoom({
    gapPx = PREVIEW_FIT_GAP_PX,
    manualZoom,
    pages,
    viewportWidthPx,
}: {
    gapPx?: number;
    manualZoom: number;
    pages: PreviewPageSize[];
    viewportWidthPx: number;
}): number {
    const largest = largestPreviewPageByWidth(pages);
    if (!largest) {
        return clampPreviewZoom(manualZoom);
    }
    return (
        clampPreviewZoom(manualZoom) *
        fitPreviewZoomForPageWidth(viewportWidthPx, largest, gapPx)
    );
}
