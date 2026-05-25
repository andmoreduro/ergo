/** CSS pixels per Typst point at 96 DPI (72 pt per inch). */
export const CSS_PX_PER_PT = 96 / 72;

/** Fallback page size (US Letter) for scroll placeholders before rasterization. */
export const DEFAULT_PAGE_WIDTH_PT = 612;
export const DEFAULT_PAGE_HEIGHT_PT = 792;

export function fallbackPixelPerPt(): number {
    return CSS_PX_PER_PT * (window.devicePixelRatio || 1);
}

export function pixelPerPtForDisplayWidth(displayWidthPx: number, pageWidthPt: number): number {
    const dpr = window.devicePixelRatio || 1;
    return (displayWidthPx * dpr) / pageWidthPt;
}

/** CSS width of a preview page at the given fit width and zoom (fit width is at 100%). */
export function previewPageDisplayWidthPx(
    fitWidthPx: number,
    zoom: number,
): number {
    return fitWidthPx * zoom;
}

/** Raster density for a page shown at `fitWidthPx * zoom` CSS pixels wide. */
export function pixelPerPtForScreenLayout(
    fitWidthPx: number,
    pageWidthPt: number,
    zoom: number,
): number {
    return pixelPerPtForDisplayWidth(
        previewPageDisplayWidthPx(fitWidthPx, zoom),
        pageWidthPt,
    );
}

export type CanvasPageMetrics = {
    widthPt: number;
    heightPt: number;
    pixelPerPt: number;
};

/** Resize canvas CSS from the last raster without re-invoking the compiler. */
export function applyCanvasDisplaySize(
    canvas: HTMLCanvasElement,
    fitWidthPx: number,
    zoom: number,
    metrics: CanvasPageMetrics,
): void {
    const cssWidth = fitWidthPx * zoom;
    const cssHeight = cssWidth * (metrics.heightPt / metrics.widthPt);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
}

export function setCanvasPageMetrics(
    canvas: HTMLCanvasElement,
    metrics: CanvasPageMetrics,
): void {
    canvas.dataset.pageWidthPt = String(metrics.widthPt);
    canvas.dataset.pageHeightPt = String(metrics.heightPt);
    canvas.dataset.pixelPerPt = String(metrics.pixelPerPt);
}

export function readCanvasPageMetrics(
    canvas: HTMLCanvasElement | null,
): CanvasPageMetrics | null {
    if (!canvas) {
        return null;
    }

    const widthPt = Number(canvas.dataset.pageWidthPt);
    const heightPt = Number(canvas.dataset.pageHeightPt);
    const pixelPerPt = Number(canvas.dataset.pixelPerPt);
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

export function previewPointFromCanvasMouseEvent(
    event: MouseEvent,
    canvas: HTMLCanvasElement,
): { xPt: number; yPt: number } | null {
    const metrics = readCanvasPageMetrics(canvas);
    if (!metrics) {
        return null;
    }

    const rect = canvas.getBoundingClientRect();
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
    fitWidthPx: number,
    zoom: number,
    metrics?: Pick<CanvasPageMetrics, "widthPt" | "heightPt"> | null,
): { width: string; minHeight: string } | undefined {
    if (fitWidthPx <= 0 || zoom <= 0) {
        return undefined;
    }

    const cssWidth = previewPageDisplayWidthPx(fitWidthPx, zoom);
    const widthPt = metrics?.widthPt ?? DEFAULT_PAGE_WIDTH_PT;
    const heightPt = metrics?.heightPt ?? DEFAULT_PAGE_HEIGHT_PT;
    const cssHeight = cssWidth * (heightPt / widthPt);

    return {
        width: `${cssWidth}px`,
        minHeight: `${cssHeight}px`,
    };
}

export type PagePtMetrics = Pick<CanvasPageMetrics, "widthPt" | "heightPt">;

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
): { left: string; top: string; height: string; transform?: string } {
    const toPercent = (ratio: number) => `${Number((ratio * 100).toFixed(2))}%`;
    const leftRatio = Math.min(1, Math.max(0, position.xPt / metrics.widthPt));

    return {
        left: leftRatio < 0.02 ? "0" : toPercent(leftRatio),
        top: toPercent(position.caretCue.topYPt / metrics.heightPt),
        height: toPercent(position.caretCue.heightPt / metrics.heightPt),
        transform: leftRatio < 0.02 ? undefined : "translateX(-50%)",
    };
}

export function caretStyleForCanvas(
    position: {
        pageNumber: number;
        xPt: number;
        yPt: number;
        caretCue: { topYPt: number; heightPt: number } | null;
    },
    canvas: HTMLCanvasElement | null,
    fallbackMetrics?: PagePtMetrics | null,
): { left: string; top: string; height: string; transform?: string } | null {
    const metrics = readCanvasPageMetrics(canvas) ?? fallbackMetrics;
    if (!metrics) {
        return null;
    }

    const caretCue = syntheticCaretCue(position);
    return caretStyleForPageMetrics({ xPt: position.xPt, caretCue }, metrics);
}
