import {
    useCallback,
    useEffect,
    useRef,
    type CSSProperties,
} from "react";
import type { RenderRegionPayload } from "../../../workers/compilerProtocol";
import {
    afterNextPaint,
    elapsedMs,
    nowMs,
    type PagePaintInfo,
} from "../../../hooks/previewTelemetry";
import styles from "./CanvasPreview.module.css";

export interface CanvasPreviewProps {
    /** Full page width/height in CSS px (the white surface box). */
    cssWidth: number;
    cssHeight: number;
    /** Full page dimensions in points (for the band → pt mapping). */
    pageWidthPt: number;
    pageHeightPt: number;
    /** Visible region to rasterize, in page-top-left-relative points. */
    bandXMinPt: number;
    bandXMaxPt: number;
    bandYMinPt: number;
    bandYMaxPt: number;
    /** Full-resolution density: zoom · CSS_PX_PER_PT · devicePixelRatio. */
    basePixelPerPt: number;
    /** Content revision; a change re-renders (with the draft factor). */
    revision: number;
    /** Whether the page is on screen. False clears + reclaims the backing store. */
    visible: boolean;
    /** Draft resolution factor while content changes (1 = always full res). */
    draftFactor?: number;
    /** Delay before promoting a draft render to full resolution. */
    idlePromoteMs?: number;
    /** Debounce before re-rendering after zoom sharpening. */
    resizeDebounceMs?: number;
    /** Debounce before re-rendering when scroll/zoom-out reveals new area. */
    revealDebounceMs?: number;
    /** Worker round-trip that rasterizes a region into a transferable ImageBitmap. */
    renderRegion: (
        pixelPerPt: number,
        xMinPt: number,
        xMaxPt: number,
        yMinPt: number,
        yMaxPt: number,
        requestId: number,
    ) => Promise<RenderRegionPayload>;
    className?: string;
    /**
     * When set, marks the surface as the preview page-content element
     * (`data-preview-page-content`) and writes the pt/density dataset so
     * click-to-source + scroll anchoring can map pointer positions to points.
     */
    previewContentMarker?: string;
    onPainted?: (info: PagePaintInfo) => void;
}

const DEFAULT_PROMOTE_MS = 180;
const DEFAULT_DEBOUNCE_MS = 200;
const DEFAULT_REVEAL_DEBOUNCE_MS = 0;

interface RenderedBand {
    xMinPt: number;
    xMaxPt: number;
    yMinPt: number;
    yMaxPt: number;
}

interface PageGeom {
    cssWidth: number;
    cssHeight: number;
    pageWidthPt: number;
    pageHeightPt: number;
}

/** Typst pages render on white; fill after resize so transparent clears never flash the surface bg. */
const PAGE_CANVAS_FILL = "#ffffff";

/**
 * Renders one page (or thumbnail) onto a band-sized `<canvas>`, rasterizing only
 * the visible vertical slice via the worker and compositing it with `drawImage`
 * (GPU). Cost scales with the viewport, not the page — the win at high zoom.
 *
 * - White surface is the placeholder before first paint and wherever the band
 *   does not cover.
 * - Zoom restyles the existing bitmap (cheap GPU scale) immediately, then a
 *   debounced re-render sharpens it at the new resolution.
 * - Scroll is free (the canvas is positioned within the surface) until a debounced
 *   re-render fills in the newly-revealed band.
 * - Leaving the viewport reclaims the backing store (`width/height = 0`).
 */
export const CanvasPreview = ({
    cssWidth,
    cssHeight,
    pageWidthPt,
    pageHeightPt,
    bandXMinPt,
    bandXMaxPt,
    bandYMinPt,
    bandYMaxPt,
    basePixelPerPt,
    revision,
    visible,
    draftFactor = 1,
    idlePromoteMs = DEFAULT_PROMOTE_MS,
    resizeDebounceMs = DEFAULT_DEBOUNCE_MS,
    revealDebounceMs = DEFAULT_REVEAL_DEBOUNCE_MS,
    renderRegion,
    className,
    previewContentMarker,
    onPainted,
}: CanvasPreviewProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);
    const requestIdRef = useRef(0);
    const renderedBandRef = useRef<RenderedBand | null>(null);
    const promoteTimerRef = useRef<number | null>(null);
    const debounceTimerRef = useRef<number | null>(null);

    // Mirror geometry into refs so an async render resolution uses the latest
    // css-per-pt without re-subscribing the worker promise.
    const geomRef = useRef({ cssWidth, cssHeight, pageWidthPt, pageHeightPt });
    geomRef.current = { cssWidth, cssHeight, pageWidthPt, pageHeightPt };

    const onPaintedRef = useRef(onPainted);
    onPaintedRef.current = onPainted;

    const cancelInFlightRenders = useCallback(() => {
        requestIdRef.current += 1;
    }, []);

    const clearTimers = useCallback(() => {
        if (promoteTimerRef.current !== null) {
            clearTimeout(promoteTimerRef.current);
            promoteTimerRef.current = null;
        }
        if (debounceTimerRef.current !== null) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
    }, []);

    // Reposition/resize the canvas box for the already-drawn band at the current
    // css-per-pt. Cheap GPU rescale of the existing bitmap during a zoom gesture.
    const restyleRenderedBand = useCallback(() => {
        const canvas = canvasRef.current;
        const band = renderedBandRef.current;
        if (!canvas || !band) {
            return;
        }
        const { cssWidth: w, cssHeight: h, pageWidthPt: pw, pageHeightPt: ph } =
            geomRef.current;
        const perPtX = pw > 0 ? w / pw : 0;
        const perPtY = ph > 0 ? h / ph : 0;
        canvas.style.left = `${band.xMinPt * perPtX}px`;
        canvas.style.top = `${band.yMinPt * perPtY}px`;
        canvas.style.width = `${(band.xMaxPt - band.xMinPt) * perPtX}px`;
        canvas.style.height = `${(band.yMaxPt - band.yMinPt) * perPtY}px`;
    }, []);

    const paintRegion = useCallback(
        (
            xMinPt: number,
            xMaxPt: number,
            yMinPt: number,
            yMaxPt: number,
            pixelPerPt: number,
        ) => {
            if (xMaxPt <= xMinPt || yMaxPt <= yMinPt || pixelPerPt <= 0) {
                return;
            }
            const requestId = requestIdRef.current + 1;
            requestIdRef.current = requestId;
            const geomAtRequest: PageGeom = { ...geomRef.current };
            const effectStartAt = nowMs();
            const workerStart = nowMs();

            void renderRegion(pixelPerPt, xMinPt, xMaxPt, yMinPt, yMaxPt, requestId)
                .then((payload) => {
                    if (requestId !== requestIdRef.current) {
                        payload.bitmap.close();
                        return;
                    }
                    const canvas = canvasRef.current;
                    if (!canvas) {
                        payload.bitmap.close();
                        return;
                    }
                    const workerRenderMs = elapsedMs(workerStart, nowMs());
                    const { cssWidth: w, pageWidthPt: pw, pageHeightPt: ph } =
                        geomAtRequest;
                    const perPtX = pw > 0 ? w / pw : 0;
                    const perPtY = ph > 0 ? geomAtRequest.cssHeight / ph : 0;

                    const writeStart = nowMs();
                    canvas.style.left = `${payload.xMinPt * perPtX}px`;
                    canvas.style.top = `${payload.yMinPt * perPtY}px`;
                    canvas.style.width = `${(payload.xMaxPt - payload.xMinPt) * perPtX}px`;
                    canvas.style.height = `${(payload.yMaxPt - payload.yMinPt) * perPtY}px`;
                    // Resize clears the backing store; fill white then blit so a
                    // transparent clear never shows the surface (or stale GPU tiles).
                    canvas.width = payload.bandWidth;
                    canvas.height = payload.bandHeight;
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                        ctx.fillStyle = PAGE_CANVAS_FILL;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(payload.bitmap, 0, 0);
                    }
                    payload.bitmap.close();
                    const domWriteMs = elapsedMs(writeStart, nowMs());

                    renderedBandRef.current = {
                        xMinPt: payload.xMinPt,
                        xMaxPt: payload.xMaxPt,
                        yMinPt: payload.yMinPt,
                        yMaxPt: payload.yMaxPt,
                    };

                    const report = onPaintedRef.current;
                    if (report) {
                        const domWrittenAt = nowMs();
                        // Honest paint: the ImageBitmap is already decoded, so
                        // drawImage composites in the next frame. afterNextPaint
                        // fires after that frame is on screen.
                        afterNextPaint(() =>
                            report({
                                effectStartAt,
                                domWrittenAt,
                                workerRenderMs,
                                domWriteMs,
                                renderedThisRevision: true,
                            }),
                        );
                    }
                })
                .catch((error) => {
                    console.error("Canvas band render failed:", error);
                });
        },
        [renderRegion],
    );

    const clearCanvas = useCallback(() => {
        clearTimers();
        cancelInFlightRenders();
        renderedBandRef.current = null;
        const canvas = canvasRef.current;
        if (canvas) {
            // Drop the backing store entirely so off-screen pages cost no memory;
            // the white surface shows through.
            canvas.width = 0;
            canvas.height = 0;
        }
    }, [cancelInFlightRenders, clearTimers]);

    // Track the previous inputs so one effect can tell zoom from scroll from a
    // content change and avoid double renders.
    const prevRef = useRef({
        visible: false,
        revision,
        basePixelPerPt,
        bandXMinPt,
        bandXMaxPt,
        bandYMinPt,
        bandYMaxPt,
    });

    useEffect(() => {
        if (!visible) {
            clearCanvas();
            prevRef.current = {
                visible,
                revision,
                basePixelPerPt,
                bandXMinPt,
                bandXMaxPt,
                bandYMinPt,
                bandYMaxPt,
            };
            return;
        }

        const prev = prevRef.current;
        const becameVisible = !prev.visible;
        const revisionChanged = prev.revision !== revision;
        const zoomChanged = prev.basePixelPerPt !== basePixelPerPt;
        const bandChanged =
            prev.bandXMinPt !== bandXMinPt ||
            prev.bandXMaxPt !== bandXMaxPt ||
            prev.bandYMinPt !== bandYMinPt ||
            prev.bandYMaxPt !== bandYMaxPt;
        prevRef.current = {
            visible,
            revision,
            basePixelPerPt,
            bandXMinPt,
            bandXMaxPt,
            bandYMinPt,
            bandYMaxPt,
        };

        // Cheap GPU rescale of the existing bitmap so zoom feels instant; the
        // debounced re-render below sharpens it.
        if (zoomChanged) {
            restyleRenderedBand();
        }

        // Render immediately on first appearance, content change, or whenever
        // nothing is drawn yet (e.g. the band only became valid after the first
        // visible commit) — so first paint never waits on the gesture debounce.
        const needsFirstPaint = renderedBandRef.current === null;
        if (becameVisible || revisionChanged || needsFirstPaint) {
            clearTimers();
            const draftPpp = basePixelPerPt * draftFactor;
            paintRegion(bandXMinPt, bandXMaxPt, bandYMinPt, bandYMaxPt, draftPpp);
            if (draftFactor < 1) {
                promoteTimerRef.current = window.setTimeout(() => {
                    promoteTimerRef.current = null;
                    paintRegion(
                        bandXMinPt,
                        bandXMaxPt,
                        bandYMinPt,
                        bandYMaxPt,
                        basePixelPerPt,
                    );
                }, idlePromoteMs);
            }
            return;
        }

        if (zoomChanged || bandChanged) {
            // Drop stale worker results before scheduling another band — otherwise
            // an in-flight raster from an earlier zoom can land with mismatched
            // layout and show corrupted slices (or unrelated UI tiles).
            cancelInFlightRenders();

            // If the drawn region no longer covers the visible region (zoom-out or
            // a scroll reveal), the rescaled bitmap shows stale slices with white
            // gaps — repaint quickly. If it still covers the view (zoom-in), the
            // rescaled bitmap is already correct, so only sharpen after the gesture.
            const drawn = renderedBandRef.current;
            const covered =
                drawn !== null &&
                drawn.xMinPt <= bandXMinPt &&
                drawn.xMaxPt >= bandXMaxPt &&
                drawn.yMinPt <= bandYMinPt &&
                drawn.yMaxPt >= bandYMaxPt;
            if (debounceTimerRef.current !== null) {
                clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = window.setTimeout(() => {
                debounceTimerRef.current = null;
                paintRegion(
                    bandXMinPt,
                    bandXMaxPt,
                    bandYMinPt,
                    bandYMaxPt,
                    basePixelPerPt,
                );
            }, covered ? resizeDebounceMs : revealDebounceMs);
        }
    }, [
        visible,
        revision,
        basePixelPerPt,
        bandXMinPt,
        bandXMaxPt,
        bandYMinPt,
        bandYMaxPt,
        draftFactor,
        idlePromoteMs,
        resizeDebounceMs,
        revealDebounceMs,
        cancelInFlightRenders,
        clearTimers,
        clearCanvas,
        paintRegion,
        restyleRenderedBand,
    ]);

    useEffect(() => clearTimers, [clearTimers]);

    const surfaceStyle: CSSProperties = {
        width: `${cssWidth}px`,
        height: `${cssHeight}px`,
    };

    return (
        <div
            ref={surfaceRef}
            className={
                className ? `${styles.surface} ${className}` : styles.surface
            }
            style={surfaceStyle}
            data-preview-page-content={previewContentMarker}
        >
            <canvas ref={canvasRef} className={styles.band} aria-hidden="true" />
        </div>
    );
};
