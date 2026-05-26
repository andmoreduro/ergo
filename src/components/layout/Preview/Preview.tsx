import {
    useCallback,
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
import { isDebugMenuEnabled } from "../../../config/debug";
import { useDocumentFocus } from "../../../state/DocumentContext";
import type { useCompiler } from "../../../hooks/useCompiler";
import type { PreviewElementPosition } from "../../../bindings/PreviewElementPosition";
import { useActionDispatcher } from "../../../actions/runtime";
import { ExportMenu } from "./ExportMenu";
import { m } from "../../../paraglide/messages.js";
import {
    formatPreviewZoomPercent,
    PREVIEW_ZOOM_DEFAULT,
    PREVIEW_ZOOM_MAX,
    PREVIEW_ZOOM_MIN,
    stepPreviewZoom,
} from "../../../preview/previewZoom";
import toolbarStyles from "../PanelToolbar.module.css";
import styles from "./Preview.module.css";
import {
    ZoomIn24Regular,
    ZoomOut24Regular,
} from "@fluentui/react-icons";

export type PreviewCompilerState = ReturnType<typeof useCompiler>;

export interface PreviewProps {
    compiler: PreviewCompilerState;
    zoom: number;
    onZoomChange: Dispatch<SetStateAction<number>>;
    zoomRenderDebounceMs: number;
    onExport: (format: import("../../../bindings/ExportFormat").ExportFormat) => void | Promise<void>;
    scrollRef?: RefObject<HTMLDivElement | null>;
}

export const Preview = ({
    compiler,
    zoom,
    onZoomChange,
    zoomRenderDebounceMs,
    onExport,
    scrollRef,
}: PreviewProps) => {
    const { documentFocus } = useDocumentFocus();
    const dispatchAction = useActionDispatcher();
    const { previewPages, error, sourceMap, previewRevision } = compiler;
    const latencyRevisionRef = useRef<number | null>(null);

    const onFirstPagePainted = useCallback(() => {
        if (previewRevision === null) {
            return;
        }
        if (latencyRevisionRef.current === previewRevision) {
            return;
        }
        latencyRevisionRef.current = previewRevision;
        compiler.markMainPreviewPainted(previewRevision);
    }, [compiler, previewRevision]);
    const showTelemetry =
        isDebugMenuEnabled() && compiler.previewTelemetry !== null;
    const zoomPercent = formatPreviewZoomPercent(zoom);
    const canZoomOut = zoom > PREVIEW_ZOOM_MIN;
    const canZoomIn = zoom < PREVIEW_ZOOM_MAX;
    const fallbackScrollRef = useRef<HTMLDivElement>(null);
    const previewScrollRef = scrollRef ?? fallbackScrollRef;
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

    const { setZoomAnchor } = usePreviewZoomInput(previewScrollRef, zoom, onZoomChange);

    useLayoutEffect(() => {
        syncCaretScrollToLayout(zoom);
    }, [syncCaretScrollToLayout, zoom]);

    return (
        <aside
            className={styles.preview}
            data-active-source-label={activeSource?.label}
            onClick={handlePreviewClick}
        >
            {error && <div className={styles.error}>{error}</div>}
            <header
                className={toolbarStyles.toolbar}
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    type="button"
                    tabIndex={-1}
                    className={toolbarStyles.toolbarButton}
                    title={m.menubar_zoom_out()}
                    aria-label={m.menubar_zoom_out()}
                    disabled={!canZoomOut}
                    onClick={() => {
                        setZoomAnchor();
                        onZoomChange((current) => stepPreviewZoom(current, -1));
                    }}
                >
                    <ZoomOut24Regular />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    className={toolbarStyles.zoomLabel}
                    title={m.preview_zoom_reset()}
                    aria-label={m.preview_zoom_reset()}
                    onClick={() => onZoomChange(PREVIEW_ZOOM_DEFAULT)}
                >
                    {m.preview_zoom_level({ percent: zoomPercent })}
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    className={toolbarStyles.toolbarButton}
                    title={m.menubar_zoom_in()}
                    aria-label={m.menubar_zoom_in()}
                    disabled={!canZoomIn}
                    onClick={() => {
                        setZoomAnchor();
                        onZoomChange((current) => stepPreviewZoom(current, 1));
                    }}
                >
                    <ZoomIn24Regular />
                </button>
                <span className={toolbarStyles.toolbarSpacer} />
                <ExportMenu onExport={onExport} />
            </header>
            <div className={styles.viewport}>
                <div
                    className={styles.scrollArea}
                    data-scroll-region
                    ref={previewScrollRef as RefObject<HTMLDivElement>}
                >
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
                                        zoom={zoom}
                                        zoomRenderDebounceMs={
                                            zoomRenderDebounceMs
                                        }
                                        previewScrollRef={previewScrollRef}
                                        onPageRendered={scrollCaretAfterPageRender}
                                        onPagePainted={onFirstPagePainted}
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
                {showTelemetry && compiler.previewTelemetry && (
                    <div className={styles.telemetryOverlay}>
                        {m.preview_telemetry({
                            latency: compiler.previewTelemetry.totalLatencyMs,
                            queue: compiler.previewTelemetry.queuedToSyncMs,
                            sync: compiler.previewTelemetry.workerSyncMs,
                            compile: compiler.previewTelemetry.compileMs,
                            paint: compiler.previewTelemetry.paintMs,
                        })}
                    </div>
                )}
            </div>
        </aside>
    );
};

interface PreviewPageCanvasProps {
    pageIndex: number;
    pageNumber: number;
    previewRevision: number;
    zoom: number;
    zoomRenderDebounceMs: number;
    previewScrollRef: RefObject<HTMLElement | null>;
    highlightedPosition: PreviewElementPosition | null;
    onPageRendered: (pageNumber: number) => void;
    onPagePainted: () => void;
}

const PreviewPageCanvas = ({
    pageIndex,
    pageNumber,
    previewRevision,
    zoom,
    zoomRenderDebounceMs,
    previewScrollRef,
    highlightedPosition,
    onPageRendered,
    onPagePainted,
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
                onPagePainted();
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
    const surfaceLayout = pageSurfaceLayoutStyle(zoom, pageMetrics);

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
