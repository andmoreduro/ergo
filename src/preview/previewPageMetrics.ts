/** CSS pixels per Typst point at 96 DPI (72 pt per inch). */
export const CSS_PX_PER_PT = 96 / 72;

/** Fallback page size (US Letter) for scroll placeholders before metrics load. */
export const DEFAULT_PAGE_WIDTH_PT = 612;
export const DEFAULT_PAGE_HEIGHT_PT = 792;

export function fallbackPixelPerPt(): number {
    return CSS_PX_PER_PT * (window.devicePixelRatio || 1);
}

export function pixelPerPtForDisplayWidth(displayWidthPx: number, pageWidthPt: number): number {
    const dpr = window.devicePixelRatio || 1;
    return (displayWidthPx * dpr) / pageWidthPt;
}

/** CSS width of a page from its Typst width and zoom (independent of the preview pane). */
export function previewPageDisplayWidthPx(
    pageWidthPt: number,
    zoom: number,
): number {
    return pageWidthPt * CSS_PX_PER_PT * zoom;
}

/**
 * Raster density for a page at the target display size.
 * When `fitWidthPx` is set (resource thumbnails), scale to that container width.
 */
export function pixelPerPtForScreenLayout(
    pageWidthPt: number,
    zoom: number,
    fitWidthPx?: number,
): number {
    const displayWidthPx =
        fitWidthPx && fitWidthPx > 0
            ? fitWidthPx * zoom
            : previewPageDisplayWidthPx(pageWidthPt, zoom);
    return pixelPerPtForDisplayWidth(displayWidthPx, pageWidthPt);
}

export type ContainerFitPx = {
    widthPx: number;
    heightPx?: number;
};

/**
 * Raster density to fit content inside a box while preserving aspect ratio.
 * Used for resource thumbnails with both width and max-height limits.
 */
export function pixelPerPtForContainerFit(
    pageWidthPt: number,
    pageHeightPt: number,
    fit: ContainerFitPx,
    zoom: number,
): number {
    if (pageWidthPt <= 0 || pageHeightPt <= 0 || fit.widthPx <= 0) {
        return pixelPerPtForScreenLayout(pageWidthPt, zoom, fit.widthPx);
    }

    const fromWidth = pixelPerPtForScreenLayout(pageWidthPt, zoom, fit.widthPx);
    if (!fit.heightPx || fit.heightPx <= 0) {
        return fromWidth;
    }

    const fromHeight = pixelPerPtForDisplayWidth(fit.heightPx * zoom, pageHeightPt);
    return Math.min(fromWidth, fromHeight);
}

function displaySizeForContainerFit(
    widthPt: number,
    heightPt: number,
    zoom: number,
    fit?: number | ContainerFitPx,
): { cssWidth: number; cssHeight: number } {
    let cssWidth = previewPageDisplayWidthPx(widthPt, zoom);
    let cssHeight = cssWidth * (heightPt / widthPt);

    const fitBox: ContainerFitPx | undefined =
        typeof fit === "number"
            ? fit > 0
                ? { widthPx: fit }
                : undefined
            : fit && fit.widthPx > 0
              ? fit
              : undefined;

    if (fitBox) {
        cssWidth = fitBox.widthPx * zoom;
        cssHeight = cssWidth * (heightPt / widthPt);
        if (fitBox.heightPx && fitBox.heightPx > 0 && cssHeight > fitBox.heightPx * zoom) {
            cssHeight = fitBox.heightPx * zoom;
            cssWidth = cssHeight * (widthPt / heightPt);
        }
    }

    return { cssWidth, cssHeight };
}

export type PreviewPageMetrics = {
    widthPt: number;
    heightPt: number;
    pixelPerPt: number;
};

export function previewPageDisplaySizeStyle(
    zoom: number,
    metrics: PreviewPageMetrics,
    fit?: number | ContainerFitPx,
): { width: string; height: string } {
    const { cssWidth, cssHeight } = displaySizeForContainerFit(
        metrics.widthPt,
        metrics.heightPt,
        zoom,
        fit,
    );
    return {
        width: `${cssWidth}px`,
        height: `${cssHeight}px`,
    };
}

export function setPreviewPageMetrics(
    element: HTMLElement,
    metrics: PreviewPageMetrics,
): void {
    element.dataset.pageWidthPt = String(metrics.widthPt);
    element.dataset.pageHeightPt = String(metrics.heightPt);
    element.dataset.pixelPerPt = String(metrics.pixelPerPt);
}

export function readPreviewPageMetrics(
    element: HTMLElement | null,
): PreviewPageMetrics | null {
    if (!element) {
        return null;
    }

    const widthPt = Number(element.dataset.pageWidthPt);
    const heightPt = Number(element.dataset.pageHeightPt);
    const pixelPerPt = Number(element.dataset.pixelPerPt);
    if (
        !Number.isFinite(widthPt) ||
        !Number.isFinite(heightPt) ||
        !Number.isFinite(pixelPerPt) ||
        widthPt <= 0 ||
        heightPt <= 0 ||
        pixelPerPt <= 0
    ) {
        return null;
    }
    return { widthPt, heightPt, pixelPerPt };
}

export function previewPointFromPageMouseEvent(
    event: MouseEvent,
    pageContent: HTMLElement,
): { xPt: number; yPt: number } | null {
    const metrics = readPreviewPageMetrics(pageContent);
    if (!metrics) {
        return null;
    }

    const rect = pageContent.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;

    return {
        xPt: xRatio * metrics.widthPt,
        yPt: yRatio * metrics.heightPt,
    };
}

export function pageSurfaceLayoutStyle(
    zoom: number,
    metrics?: Pick<PreviewPageMetrics, "widthPt" | "heightPt"> | null,
    fitWidthPx?: number,
): { width: string; minHeight: string } | undefined {
    if (zoom <= 0) {
        return undefined;
    }

    const widthPt = metrics?.widthPt ?? DEFAULT_PAGE_WIDTH_PT;
    const heightPt = metrics?.heightPt ?? DEFAULT_PAGE_HEIGHT_PT;
    const cssWidth =
        fitWidthPx && fitWidthPx > 0
            ? fitWidthPx * zoom
            : previewPageDisplayWidthPx(widthPt, zoom);
    const cssHeight = cssWidth * (heightPt / widthPt);

    return {
        width: `${cssWidth}px`,
        minHeight: `${cssHeight}px`,
    };
}

export type PagePtMetrics = Pick<PreviewPageMetrics, "widthPt" | "heightPt">;

/** Resolve Typst page dimensions from a page container or fallbacks. */
export function resolvePreviewPageMetrics(
    pageElement?: HTMLElement | null,
    fallback?: PagePtMetrics | null,
): PagePtMetrics | null {
    if (pageElement) {
        const nested = pageElement.querySelector("[data-preview-page-content]");
        if (nested instanceof HTMLElement) {
            const fromNested = readPreviewPageMetrics(nested);
            if (fromNested) {
                return fromNested;
            }
        }

        const fromPage = readPreviewPageMetrics(pageElement);
        if (fromPage) {
            return fromPage;
        }
    }

    if (fallback) {
        return fallback;
    }

    return {
        widthPt: DEFAULT_PAGE_WIDTH_PT,
        heightPt: DEFAULT_PAGE_HEIGHT_PT,
    };
}

const DEFAULT_CARET_HEIGHT_PT = 12;

export function syntheticCaretCue(position: {
    yPt: number;
    caretCue: { topYPt: number; heightPt: number } | null;
}): { topYPt: number; heightPt: number } {
    if (position.caretCue) {
        return position.caretCue;
    }

    const heightPt = DEFAULT_CARET_HEIGHT_PT;
    return {
        topYPt: Math.max(0, position.yPt - heightPt * 0.5),
        heightPt,
    };
}

export function caretStyleForPageMetrics(
    position: {
        xPt: number;
        caretCue: { topYPt: number; heightPt: number };
    },
    metrics: PagePtMetrics,
): { left: string; top: string; height: string; transform: string } {
    const toPercent = (ratio: number) => `${Number((ratio * 100).toFixed(2))}%`;
    const leftRatio = Math.min(1, Math.max(0, position.xPt / metrics.widthPt));
    const centerYPt =
        position.caretCue.topYPt + position.caretCue.heightPt * 0.5;

    return {
        left: toPercent(leftRatio),
        top: toPercent(centerYPt / metrics.heightPt),
        height: toPercent(position.caretCue.heightPt / metrics.heightPt),
        transform: "translate(-50%, -50%)",
    };
}
