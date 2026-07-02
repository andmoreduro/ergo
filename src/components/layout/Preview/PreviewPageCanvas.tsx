import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type RefObject,
} from "react";
import {
    CSS_PX_PER_PT,
    DEFAULT_PAGE_HEIGHT_PT,
    DEFAULT_PAGE_WIDTH_PT,
    pageSurfaceLayoutStyle,
    type PagePtMetrics,
} from "../../../preview/previewPageMetrics";
import { useInViewport } from "../../../hooks/useInViewport";
import type { PagePaintInfo } from "../../../hooks/previewTelemetry";
import { CanvasPreview } from "../../molecules/CanvasPreview/CanvasPreview";
import { CompilerClient } from "../../../workers/compilerClient";
import type { PreviewCaret } from "../../../hooks/usePreviewForwardSync";
import styles from "./Preview.module.css";

export interface PreviewPageCanvasProps {
    changed: boolean;
    initialMetrics: PagePtMetrics | null;
    pageIndex: number;
    pageNumber: number;
    previewRevision: number;
    zoom: number;
    draftFactor: number;
    /** Milliseconds an idle draft render waits before promoting to full res. */
    idlePromoteMs: number;
    /** Fraction of the viewport rasterized beyond the visible edges (0 = exact). */
    overscanFactor: number;
    rasterizationDebounceMs: number;
    revealDebounceMs: number;
    previewScrollRef: RefObject<HTMLElement | null>;
    /** Forward-sync cues to draw on this page (empty when none are here). */
    carets: PreviewCaret[];
    onPagePainted: (paintInfo: PagePaintInfo) => void;
    onPageMetrics: (pageNumber: number, metrics: PagePtMetrics) => void;
}

/** Quantize band bounds (pt) so small scrolls don't churn the render. */
const BAND_STEP_PT = 24;

const PreviewPageCanvasComponent = ({
    changed,
    initialMetrics,
    pageIndex,
    pageNumber,
    previewRevision,
    zoom,
    draftFactor,
    idlePromoteMs,
    overscanFactor,
    rasterizationDebounceMs,
    revealDebounceMs,
    previewScrollRef,
    carets,
    onPagePainted,
    onPageMetrics,
}: PreviewPageCanvasProps) => {
    const pageRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<HTMLDivElement>(null);

    const metrics = initialMetrics ?? {
        widthPt: DEFAULT_PAGE_WIDTH_PT,
        heightPt: DEFAULT_PAGE_HEIGHT_PT,
    };

    // Surface known page metrics upward for zoom-fit math.
    useEffect(() => {
        if (initialMetrics) {
            onPageMetrics(pageNumber, initialMetrics);
        }
    }, [initialMetrics, onPageMetrics, pageNumber]);

    // A page-content revision that only advances when this page actually changed,
    // so unchanged pages don't re-rasterize on every compile.
    const contentRevisionRef = useRef(previewRevision);
    if (changed) {
        contentRevisionRef.current = previewRevision;
    }
    const contentRevision = contentRevisionRef.current;

    const isInViewport = useInViewport(pageRef, { rootRef: previewScrollRef });

    const cssWidth = metrics.widthPt * zoom * CSS_PX_PER_PT;
    const cssHeight = metrics.heightPt * zoom * CSS_PX_PER_PT;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const basePixelPerPt = zoom * CSS_PX_PER_PT * dpr;

    // null until the visible region is measured, so the canvas shows the white
    // placeholder (never a full-page raster) until we know the real slice.
    const [band, setBand] = useState<{
        xMinPt: number;
        xMaxPt: number;
        yMinPt: number;
        yMaxPt: number;
    } | null>(null);

    const pageWidthPt = metrics.widthPt;
    const pageHeightPt = metrics.heightPt;
    const recomputeBand = useCallback(() => {
        const surface = surfaceRef.current;
        const scroll = previewScrollRef.current;
        if (!surface || !scroll) {
            return;
        }
        const pr = surface.getBoundingClientRect();
        const sr = scroll.getBoundingClientRect();
        if (pr.width <= 0 || pr.height <= 0) {
            return;
        }
        const perPtX = pr.width / pageWidthPt;
        const perPtY = pr.height / pageHeightPt;
        const overscanX = sr.width * overscanFactor;
        const overscanY = sr.height * overscanFactor;
        // Intersect the page rect with the visible pane (both axes), so nothing
        // off-screen left/right or above/below is rasterized.
        const leftCss = Math.max(0, sr.left - pr.left - overscanX);
        const rightCss = Math.min(pr.width, sr.right - pr.left + overscanX);
        const topCss = Math.max(0, sr.top - pr.top - overscanY);
        const bottomCss = Math.min(pr.height, sr.bottom - pr.top + overscanY);
        if (rightCss <= leftCss || bottomCss <= topCss) {
            return;
        }
        const xMinPt = Math.max(
            0,
            Math.floor(leftCss / perPtX / BAND_STEP_PT) * BAND_STEP_PT,
        );
        const xMaxPt = Math.min(
            pageWidthPt,
            Math.ceil(rightCss / perPtX / BAND_STEP_PT) * BAND_STEP_PT,
        );
        const yMinPt = Math.max(
            0,
            Math.floor(topCss / perPtY / BAND_STEP_PT) * BAND_STEP_PT,
        );
        const yMaxPt = Math.min(
            pageHeightPt,
            Math.ceil(bottomCss / perPtY / BAND_STEP_PT) * BAND_STEP_PT,
        );
        setBand((current) =>
            current &&
            current.xMinPt === xMinPt &&
            current.xMaxPt === xMaxPt &&
            current.yMinPt === yMinPt &&
            current.yMaxPt === yMaxPt
                ? current
                : { xMinPt, xMaxPt, yMinPt, yMaxPt },
        );
    }, [previewScrollRef, pageWidthPt, pageHeightPt, overscanFactor]);

    // Reset the band when the page leaves the viewport so it re-measures on return.
    useEffect(() => {
        if (!isInViewport) {
            setBand(null);
        }
    }, [isInViewport]);

    // Measure the band before paint when visibility or zoom changes.
    useLayoutEffect(() => {
        if (isInViewport) {
            recomputeBand();
        }
    }, [isInViewport, cssWidth, cssHeight, zoom, recomputeBand]);

    // While visible, track the band on scroll (rAF-throttled).
    useEffect(() => {
        if (!isInViewport) {
            return;
        }
        const scroll = previewScrollRef.current;
        if (!scroll) {
            return;
        }
        let frame = 0;
        const onScroll = () => {
            if (frame) {
                return;
            }
            frame = requestAnimationFrame(() => {
                frame = 0;
                recomputeBand();
            });
        };
        // Capture so both the outer (vertical) scroll area and the inner
        // (horizontal) scroll container's scroll events reach this listener.
        scroll.addEventListener("scroll", onScroll, {
            passive: true,
            capture: true,
        });
        return () => {
            scroll.removeEventListener("scroll", onScroll, { capture: true });
            if (frame) {
                cancelAnimationFrame(frame);
            }
        };
    }, [isInViewport, previewScrollRef, recomputeBand]);

    const renderRegion = useCallback(
        (
            pixelPerPt: number,
            xMinPt: number,
            xMaxPt: number,
            yMinPt: number,
            yMaxPt: number,
            requestId: number,
        ) =>
            CompilerClient.renderPageRegion(
                pageIndex,
                pixelPerPt,
                xMinPt,
                xMaxPt,
                yMinPt,
                yMaxPt,
                requestId,
            ),
        [pageIndex],
    );

    const surfaceLayout = pageSurfaceLayoutStyle(zoom, metrics);
    const pageContainStyle = surfaceLayout
        ? {
              containIntrinsicSize: `${surfaceLayout.width} ${surfaceLayout.minHeight}`,
          }
        : undefined;

    return (
        <div
            ref={pageRef}
            className={styles.page}
            data-preview-page-number={pageNumber}
            style={pageContainStyle}
        >
            <div
                ref={surfaceRef}
                className={styles.pageSurface}
                data-preview-page-surface="true"
                style={surfaceLayout}
            >
                <CanvasPreview
                    cssWidth={cssWidth}
                    cssHeight={cssHeight}
                    pageWidthPt={metrics.widthPt}
                    pageHeightPt={metrics.heightPt}
                    bandXMinPt={band?.xMinPt ?? 0}
                    bandXMaxPt={band?.xMaxPt ?? 0}
                    bandYMinPt={band?.yMinPt ?? 0}
                    bandYMaxPt={band?.yMaxPt ?? 0}
                    basePixelPerPt={basePixelPerPt}
                    revision={contentRevision}
                    visible={isInViewport && band !== null}
                    draftFactor={draftFactor}
                    idlePromoteMs={idlePromoteMs}
                    resizeDebounceMs={rasterizationDebounceMs}
                    revealDebounceMs={revealDebounceMs}
                    renderRegion={renderRegion}
                    previewContentMarker="canvas"
                    onPainted={onPagePainted}
                />
                {carets.map((caret, index) => (
                    <div
                        key={`${caret.xPt}:${caret.topYPt}:${index}`}
                        className={styles.previewCaret}
                        style={{
                            left: `${caret.xPt * zoom * CSS_PX_PER_PT}px`,
                            top: `${caret.topYPt * zoom * CSS_PX_PER_PT}px`,
                            height: `${caret.heightPt * zoom * CSS_PX_PER_PT}px`,
                        }}
                        aria-hidden="true"
                    />
                ))}
            </div>
        </div>
    );
};

/**
 * Memoized so the page list (one instance per page) doesn't re-render on every
 * parent render. Unchanged pages ignore `previewRevision` bumps so a keystroke
 * only re-rasterizes the pages whose content actually changed.
 */
const previewPageCanvasPropsAreEqual = (
    prev: PreviewPageCanvasProps,
    next: PreviewPageCanvasProps,
): boolean => {
    if (
        prev.pageIndex !== next.pageIndex ||
        prev.pageNumber !== next.pageNumber ||
        prev.zoom !== next.zoom ||
        prev.draftFactor !== next.draftFactor ||
        prev.idlePromoteMs !== next.idlePromoteMs ||
        prev.overscanFactor !== next.overscanFactor ||
        prev.rasterizationDebounceMs !== next.rasterizationDebounceMs ||
        prev.revealDebounceMs !== next.revealDebounceMs ||
        prev.changed !== next.changed ||
        prev.initialMetrics !== next.initialMetrics ||
        prev.previewScrollRef !== next.previewScrollRef ||
        prev.carets !== next.carets ||
        prev.onPagePainted !== next.onPagePainted ||
        prev.onPageMetrics !== next.onPageMetrics
    ) {
        return false;
    }
    if (next.changed && prev.previewRevision !== next.previewRevision) {
        return false;
    }
    return true;
};

export const PreviewPageCanvas = memo(
    PreviewPageCanvasComponent,
    previewPageCanvasPropsAreEqual,
);
