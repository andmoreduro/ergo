import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type Dispatch,
    type MouseEvent,
    type RefObject,
    type SetStateAction,
} from "react";
import { usePreviewZoomInput } from "../../../hooks/usePreviewZoomInput";
import { useTypstCanvasPage } from "../../../hooks/useTypstCanvasPage";
import {
    caretStyleForCanvas,
    DEFAULT_PAGE_HEIGHT_PT,
    DEFAULT_PAGE_WIDTH_PT,
    pageSurfaceLayoutStyle,
    previewPointFromCanvasMouseEvent,
    readCanvasPageMetrics,
    syntheticCaretCue,
} from "../../../preview/canvasMetrics";
import { useInViewport } from "../../../hooks/useInViewport";
import {
    caretScrollKey,
    scrollPreviewToCaretPosition,
} from "../../../preview/previewScroll";
import { CompilerClient } from "../../../workers/compilerClient";
import { useDocumentFocus } from "../../../state/DocumentContext";
import type { useCompiler } from "../../../hooks/useCompiler";
import type { PreviewElementPosition } from "../../../bindings/PreviewElementPosition";
import type { PreviewFocusTarget } from "../../../bindings/PreviewFocusTarget";
import { backendFocusIdsForEditorField } from "../../../editor/fieldIds";
import { useActionDispatcher } from "../../../actions/runtime";
import { m } from "../../../paraglide/messages.js";
import {
    formatPreviewZoomPercent,
} from "../../../preview/previewZoom";
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
    const syncCueRequestIdRef = useRef(0);
    const lastFocusTargetRef = useRef<{
        target: PreviewFocusTarget;
        revision: number;
    } | null>(null);
    const lastCaretScrollKeyRef = useRef<string | null>(null);
    const [highlightedPosition, setHighlightedPosition] =
        useState<PreviewElementPosition | null>(null);
    const activeSource = sourceMap.find(
        (entry) => entry.elementId === documentFocus.elementId,
    );

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

    const clearHighlightedPosition = useCallback(() => {
        syncCueRequestIdRef.current += 1;
        lastCaretScrollKeyRef.current = null;
        setHighlightedPosition(null);
    }, []);

    const normalizeCaretPosition = useCallback(
        (position: PreviewElementPosition): PreviewElementPosition => ({
            ...position,
            caretCue: syntheticCaretCue(position),
        }),
        [],
    );

    const scrollToHighlightedCaret = useCallback(
        (position: PreviewElementPosition, force = false) => {
            const scrollRoot = previewScrollRef.current;
            if (!scrollRoot) {
                return false;
            }

            const withCaret = normalizeCaretPosition(position);
            const key = caretScrollKey(withCaret);
            if (!force && lastCaretScrollKeyRef.current === key) {
                return true;
            }

            const scrolled = scrollPreviewToCaretPosition(scrollRoot, {
                pageNumber: withCaret.pageNumber,
                xPt: withCaret.xPt,
                caretCue: withCaret.caretCue!,
            });
            if (scrolled) {
                lastCaretScrollKeyRef.current = key;
            }
            return scrolled;
        },
        [normalizeCaretPosition],
    );

    const scheduleScrollToHighlightedCaret = useCallback(
        (position: PreviewElementPosition, force = false) => {
            const attempt = (remaining: number) => {
                if (scrollToHighlightedCaret(position, force)) {
                    return;
                }
                if (remaining <= 0) {
                    return;
                }
                requestAnimationFrame(() => attempt(remaining - 1));
            };
            attempt(8);
        },
        [scrollToHighlightedCaret],
    );

    const requestHighlightedPosition = useCallback(
        async (target: PreviewFocusTarget, displayedRevision: number) => {
            const requestId = syncCueRequestIdRef.current + 1;
            syncCueRequestIdRef.current = requestId;

            try {
                const result = await CompilerClient.positionsForFocus(
                    target,
                    displayedRevision,
                );
                if (requestId !== syncCueRequestIdRef.current) {
                    return;
                }

                const raw =
                    result.status === "matched" && result.positions.length > 0
                        ? (result.positions.find((entry) => entry.caretCue) ??
                          result.positions[0])
                        : null;
                if (!raw) {
                    lastCaretScrollKeyRef.current = null;
                    setHighlightedPosition(null);
                    return;
                }

                const position = normalizeCaretPosition(raw);
                setHighlightedPosition(position);
                scheduleScrollToHighlightedCaret(position);
            } catch {
                if (requestId === syncCueRequestIdRef.current) {
                    lastCaretScrollKeyRef.current = null;
                    setHighlightedPosition(null);
                }
            }
        },
        [normalizeCaretPosition, scheduleScrollToHighlightedCaret],
    );

    useLayoutEffect(() => {
        if (!highlightedPosition) {
            return;
        }

        scheduleScrollToHighlightedCaret(highlightedPosition);
    }, [highlightedPosition, scheduleScrollToHighlightedCaret]);

    useLayoutEffect(() => {
        if (!highlightedPosition) {
            return;
        }

        scheduleScrollToHighlightedCaret(highlightedPosition, true);
    }, [
        highlightedPosition,
        zoom,
        previewFitWidth,
        scheduleScrollToHighlightedCaret,
    ]);

    useEffect(() => {
        if (!documentFocus.elementId || previewRevision === null) {
            clearHighlightedPosition();
            return;
        }

        const previewTarget = backendFocusIdsForEditorField(
            documentFocus.elementId,
            documentFocus.fieldId,
        );
        const target = {
            elementId: previewTarget.elementId,
            fieldId: previewTarget.fieldId,
            caretUtf16Offset: documentFocus.caretUtf16Offset,
            sourceRevision: previewRevision,
        };

        lastFocusTargetRef.current = { target, revision: previewRevision };
        void requestHighlightedPosition(target, previewRevision);
    }, [
        clearHighlightedPosition,
        documentFocus.caretUtf16Offset,
        documentFocus.elementId,
        documentFocus.fieldId,
        previewRevision,
        requestHighlightedPosition,
    ]);

    const scrollCaretAfterPageRender = useCallback(
        (pageNumber: number) => {
            if (
                highlightedPosition === null ||
                highlightedPosition.pageNumber !== pageNumber
            ) {
                return;
            }

            scheduleScrollToHighlightedCaret(highlightedPosition, true);
        },
        [highlightedPosition, scheduleScrollToHighlightedCaret],
    );

    const handlePreviewClick = (event: MouseEvent<HTMLElement>) => {
        if (previewRevision === null || !(event.target instanceof Element)) {
            return;
        }

        const pageElement = event.target.closest<HTMLElement>(
            "[data-preview-page-number]",
        );
        const pageNumber = Number(pageElement?.dataset.previewPageNumber);
        const canvas = pageElement?.querySelector("canvas");
        const point =
            canvas instanceof HTMLCanvasElement
                ? previewPointFromCanvasMouseEvent(event.nativeEvent, canvas)
                : null;

        if (!pageElement || !Number.isFinite(pageNumber) || !point) {
            return;
        }

        void CompilerClient.jumpFromClick(
            pageNumber,
            point.xPt,
            point.yPt,
            previewRevision,
        )
            .then((result) => {
                if (result.status === "field") {
                    if (result.sourceRevision === previewRevision) {
                        void requestHighlightedPosition(
                            result.target,
                            previewRevision,
                        );
                    }
                    void dispatchAction({
                        id: "editor::FocusField",
                        payload: result.target,
                    });
                    return;
                }

                if (result.status === "element") {
                    clearHighlightedPosition();
                    void dispatchAction({
                        id: "editor::FocusField",
                        payload: {
                            elementId: result.elementId,
                            fieldId: null,
                            caretUtf16Offset: null,
                            sourceRevision: result.sourceRevision,
                        },
                    });
                }
            })
            .catch(() => undefined);
    };

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
                        {previewPages.length > 0 ? (
                            previewPages.map((page, index) => {
                                const pageNumber = page.page_number;
                                return (
                                    <PreviewPageCanvas
                                        key={index}
                                        pageIndex={index}
                                        pageNumber={pageNumber}
                                        previewRevision={previewRevision || 0}
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
        [pageIndex, previewRevision],
        {
            onError: (err) => {
                console.error("Failed to render page to canvas:", err);
            },
            onRendered: () => {
                const canvas = canvasRef.current;
                const metrics = canvas ? readCanvasPageMetrics(canvas) : null;
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

    const metricsForCaret =
        readCanvasPageMetrics(canvasRef.current) ??
        pageMetrics ??
        (highlightedPosition?.pageNumber === pageNumber
            ? {
                  widthPt: DEFAULT_PAGE_WIDTH_PT,
                  heightPt: DEFAULT_PAGE_HEIGHT_PT,
              }
            : null);

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
