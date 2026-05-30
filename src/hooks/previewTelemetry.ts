export interface PreviewTelemetry {
    totalLatencyMs: number;
    queuedToSyncMs: number;
    workerSyncMs: number;
    compileMs: number;
    /** Compile result → first visible page's SVG written into the DOM. */
    svgRenderMs: number;
    /** Of svgRenderMs: the `renderSvgPage` worker round-trip (Typst → SVG). */
    workerRenderMs: number;
    /** Of svgRenderMs: the `innerHTML =` parse of that SVG string. */
    domWriteMs: number;
    /** SVG in the DOM → the browser actually paints that frame (double-rAF). */
    rasterMs: number;
}

/** Sub-timings a page reports when it finishes writing its SVG to the DOM. */
export interface PagePaintInfo {
    domWrittenAt: number;
    workerRenderMs: number;
    domWriteMs: number;
    /**
     * Whether this page actually re-rendered its SVG for this revision (vs an
     * unchanged page painting instantly). Telemetry is finalized from the first
     * page that did, so "render" reflects the edited page, not a no-op neighbor.
     */
    renderedThisRevision: boolean;
}

export interface PendingPreviewTelemetry {
    revision: number;
    startedAt: number;
    compileResultAt: number;
    queuedToSyncMs: number;
    workerSyncMs: number;
    compileMs: number;
}

export const nowMs = (): number => Date.now();

export const elapsedMs = (startedAt: number, endedAt: number): number =>
    Math.max(0, Math.round(endedAt - startedAt));

/**
 * Invoke `cb` after the browser has painted the current frame. The first rAF
 * callback runs just before a paint; the nested one runs at the start of the
 * following frame, i.e. after that paint has happened — the closest portable
 * proxy for "pixels are on screen." Returns a canceller.
 */
export const afterNextPaint = (cb: () => void): (() => void) => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(cb);
    });
    return () => {
        cancelAnimationFrame(outer);
        if (inner) {
            cancelAnimationFrame(inner);
        }
    };
};
