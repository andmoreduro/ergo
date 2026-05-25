import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import { usePreviewCaretSync } from "../../../hooks/usePreviewCaretSync";
import { usePreviewZoomInput } from "../../../hooks/usePreviewZoomInput";
import { useTypstCanvasPage } from "../../../hooks/useTypstCanvasPage";
import {
    caretStyleForCanvas,
    pageSurfaceLayoutStyle,
    resolvePreviewPageMetrics,
} from "../../../preview/canvasMetrics";
import { useInViewport } from "../../../hooks/useInViewport";
import { CompilerClient } from "../../../workers/compilerClient";
import { useDocumentFocus } from "../../../state/DocumentContext";
import type { useCompiler } from "../../../hooks/useCompiler";
import type { PreviewElementPosition } from "../../../bindings/PreviewElementPosition";
import { useActionDispatcher } from "../../../actions/runtime";
import { m } from "../../../paraglide/messages.js";
import { formatPreviewZoomPercent } from "../../../preview/previewZoom";
import styles from "./Preview.module.css";

export type PreviewCompilerState = ReturnType<typeof useCompiler>;

export interface PreviewProps {
    compiler: PreviewCompilerState;
    zoom: number;
    onZoomChange: Dispatch<SetStateAction<number>>;
    zoomRenderDebounceMs: number;
}

export const Preview = ({
    compiler,
    zoom,
    onZoomChange,
    zoomRenderDebounceMs,
}: PreviewProps) => {
    const { documentFocus } = useDocumentFocus();
    const dispatchAction = useActionDispatcher();
    const { previewPages, error, sourceMap, previewRevision, latencyMs } = compiler;
    const previewScrollRef = useRef<HTMLDivElement>(null);
    const [previewFitWidth, setPreviewFitWidth] = useState(0);
    const activeSource = sourceMap.find(
        (entry) => entry.elementId === documentFocus.elementId,
    );

    const {
        highlightedPosition,
        handlePreviewClick,
        scrollCaretAfterPageRender,
        syncCaretScrollToLayout,
    } = usePreviewCaretSync({
        scrollRef: previewScrollRef,
        documentFocus,
        previewRevision,
        dispatchAction,
    });

    useEffect(() => {
        const scrollArea = previewScrollRef.current;
        if (!scrollArea) {
            return;
        }

        const updateFitWidth = () => {
            setPreviewFitWidth(scrollArea.clientWidth);
        };

        updateFitWidth();

        let observer: ResizeObserver | undefined;
        if (typeof ResizeObserver !== "undefined") {
            observer = new ResizeObserver(updateFitWidth);
            observer.observe(scrollArea);
        }

        return () => observer?.disconnect();
    }, []);

    usePreviewZoomInput(previewScrollRef, zoom, onZoomChange);

    useLayoutEffect(() => {
        syncCaretScrollToLayout(zoom, previewFitWidth);
    }, [syncCaretScrollToLayout, zoom, previewFitWidth]);

    return (
        <aside
            className={styles.preview}
            data-active-source-label={activeSource?.label}
            onClick={handlePreviewClick}
        >
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.viewport}>
                <div className={styles.scrollArea} ref={previewScrollRef}>
                    <div className={styles.svgContainer}>
                        {previewPages.length > 0 && previewRevision !== null ? (
                            previewPages.map((page, index) => {
                                const pageNumber = page.page_number;
                                return (
                                    <PreviewPageCanvas
                                        key={pageNumber}
                                        pageIndex={index}
                                        pageNumber={pageNumber}
                                        previewRevision={previewRevision}
                                        highlightedPosition={highlightedPosition}
                                        fitWidthPx={previewFitWidth}
                                        zoom={zoom}
                                        zoomRenderDebounceMs={
                                            zoomRenderDebounceMs
                                        }
                                        previewScrollRef={previewScrollRef}
                                        onPageRendered={scrollCaretAfterPageRender}
                                    />
                                );
                            })
                        ) : (
                            <div className={styles.placeholder}>
                                {m.workspace_preview_placeholder()}
                            </div>
                        )}
                    </div>
                </div>
                <div className={styles.telemetryOverlay}>
                    {m.preview_zoom_level({
                        percent: formatPreviewZoomPercent(zoom),
                    })}
                    {latencyMs !== null && (
                        <span className={styles.telemetryLatency}>
                            {m.preview_telemetry({ latency: latencyMs })}
                        </span>
                    )}
                </div>
            </div>
        </aside>
    );
};

interface PreviewPageCanvasProps {
    pageIndex: number;
    pageNumber: number;
    previewRevision: number;
    fitWidthPx: number;
    zoom: number;
    zoomRenderDebounceMs: number;
    previewScrollRef: RefObject<HTMLElement | null>;
    highlightedPosition: PreviewElementPosition | null;
    onPageRendered: (pageNumber: number) => void;
}

const PreviewPageCanvas = ({
    pageIndex,
    pageNumber,
    previewRevision,
    fitWidthPx,
    zoom,
    zoomRenderDebounceMs,
    previewScrollRef,
    highlightedPosition,
    onPageRendered,
}: PreviewPageCanvasProps) => {
    const pageRef = useRef<HTMLDivElement>(null);
    const [pageMetrics, setPageMetrics] = useState<{
        widthPt: number;
        heightPt: number;
    } | null>(null);

    useEffect(() => {
        setPageMetrics(null);
    }, [previewRevision]);

    const needsCaretRender =
        highlightedPosition?.pageNumber === pageNumber &&
        highlightedPosition.caretCue !== null;

    const isInViewport = useInViewport(pageRef, {
        rootRef: previewScrollRef,
        forceVisible: needsCaretRender,
    });

    const { canvasRef } = useTypstCanvasPage(
        (requestId, pixelPerPt) =>
            CompilerClient.renderPage(pageIndex, pixelPerPt, requestId),
        fitWidthPx,
        zoom,
        zoomRenderDebounceMs,
        isInViewport,
        pageIndex,
        previewRevision,
        {
            onError: (err) => {
                console.error("Failed to render page to canvas:", err);
            },
            onRendered: () => {
                const canvas = canvasRef.current;
                const metrics = canvas
                    ? resolvePreviewPageMetrics(pageRef.current, canvas)
                    : null;
                if (metrics) {
                    setPageMetrics({
                        widthPt: metrics.widthPt,
                        heightPt: metrics.heightPt,
                    });
                }
                onPageRendered(pageNumber);
            },
        },
    );

    const metricsForCaret = resolvePreviewPageMetrics(
        pageRef.current,
        canvasRef.current,
        pageMetrics,
    );

    const caretStyle =
        highlightedPosition &&
        highlightedPosition.pageNumber === pageNumber &&
        metricsForCaret
            ? caretStyleForCanvas(
                  highlightedPosition,
                  canvasRef.current,
                  metricsForCaret,
              )
            : null;
    const surfaceLayout = pageSurfaceLayoutStyle(
        fitWidthPx,
        zoom,
        pageMetrics,
    );

    return (
        <div
            ref={pageRef}
            className={styles.page}
            data-preview-page-number={pageNumber}
        >
            <div
                className={styles.pageSurface}
                data-preview-page-surface="true"
                data-active-preview-page={caretStyle ? "true" : undefined}
                style={surfaceLayout}
            >
                <canvas ref={canvasRef} style={{ display: "block" }} />
                {caretStyle && (
                    <span
                        key={`${highlightedPosition?.sourceRevision}-${highlightedPosition?.elementId}-${highlightedPosition?.fieldId}-${highlightedPosition?.caretUtf16Offset}-${caretStyle.left}-${caretStyle.top}`}
                        className={styles.syncCaret}
                        data-preview-sync-caret="true"
                        style={caretStyle}
                    />
                )}
            </div>
        </div>
    );
};
