export interface PreviewTelemetry {
    totalLatencyMs: number;
    queuedToSyncMs: number;
    workerSyncMs: number;
    /** Worker compile trip (Typst layout + page metadata). */
    compileMs: number;
    /**
     * Compile result → first visible page's canvas blit completes. Despite the
     * legacy name, the preview renders to a `<canvas>` via `drawImage` of a
     * worker-produced `ImageBitmap`, not SVG. This spans schedule + the worker
     * region round-trip + the canvas write.
     */
    svgRenderMs: number;
    /**
     * Of svgRenderMs: the wait from the compile result arriving to the page's
     * render effect actually starting. Split into `deferMs` + `commitMs`.
     */
    scheduleMs: number;
    /**
     * Of scheduleMs: compile result → React begins rendering the Preview tree for
     * this revision. Large here = React's async scheduler is not getting to the
     * update promptly (busy main thread / concurrent deferral), which a
     * synchronous flush would bypass.
     */
    deferMs: number;
    /**
     * Of scheduleMs: React begins rendering Preview → the page's render effect
     * runs (render + commit of the Preview subtree). Large here = the render
     * itself is expensive, so the fix is reducing per-keystroke render work.
     */
    commitMs: number;
    /** Of commit: React render+commit only (before browser paint). */
    reactCommitMs: number;
    /** Of commit: browser paint after React commit (commit − reactCommit). */
    paintMs: number;
    /**
     * Of svgRenderMs: the `renderRegion` worker round-trip (Typst layout →
     * region bitmap). Zero when the page reused a cached bitmap without a
     * worker trip.
     */
    workerRenderMs: number;
    /** Of svgRenderMs: the `drawImage` blit of the returned ImageBitmap. */
    domWriteMs: number;
    /** Canvas blit → the browser actually composites that frame (double-rAF). */
    rasterMs: number;
}

/** Sub-timings a page reports when it finishes blitting its canvas region. */
export interface PagePaintInfo {
    /** When the page's render effect began running (after React scheduled it). */
    effectStartAt: number;
    /**
     * When React began rendering the Preview tree for this revision (filled in by
     * the Preview parent, not the page). Splits the schedule gap into defer/commit.
     */
    previewRenderAt?: number | null;
    /**
     * Probe: when React finished committing this revision (after canvas mutation,
     * before paint). Splits `commit` into React render+commit vs browser paint.
     */
    reactCommittedAt?: number | null;
    domWrittenAt: number;
    workerRenderMs: number;
    domWriteMs: number;
    /**
     * Whether this page actually re-rendered its canvas region for this revision
     * (vs an unchanged page painting instantly). Telemetry is finalized from the
     * first page that did, so "render" reflects the edited page, not a no-op
     * neighbor.
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
