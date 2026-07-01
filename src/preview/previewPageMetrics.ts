/** CSS pixels per Typst point at 96 DPI (72 pt per inch). */
export const CSS_PX_PER_PT = 96 / 72;

/** Fallback page size (US Letter) for scroll placeholders before metrics load. */
export const DEFAULT_PAGE_WIDTH_PT = 612;
export const DEFAULT_PAGE_HEIGHT_PT = 792;

/** CSS width of a page from its Typst width and zoom (independent of the preview pane). */
export function previewPageDisplayWidthPx(
    pageWidthPt: number,
    zoom: number,
): number {
    return pageWidthPt * CSS_PX_PER_PT * zoom;
}

export type ContainerFitPx = {
    widthPx: number;
    heightPx?: number;
};

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

/**
 * Map a pointer position on a rendered page surface into page-space points.
 * The caller supplies the page's Typst size (it already tracks it in React
 * state); only the live pixel box is read from the DOM, since that reflects
 * the element's current on-screen layout.
 */
export function previewPointFromPageMouseEvent(
    event: MouseEvent,
    pageContent: HTMLElement,
    metrics: PreviewPageMetrics,
): { xPt: number; yPt: number } | null {
    if (
        !Number.isFinite(metrics.widthPt) ||
        !Number.isFinite(metrics.heightPt) ||
        metrics.widthPt <= 0 ||
        metrics.heightPt <= 0
    ) {
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
