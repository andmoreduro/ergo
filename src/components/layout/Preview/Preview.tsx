import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import { usePreviewCaretSync } from "../../../hooks/usePreviewCaretSync";
import { usePreviewZoomInput } from "../../../hooks/usePreviewZoomInput";
import {
    caretStyleForPageMetrics,
    canvasDisplaySizeStyle,
    pageSurfaceLayoutStyle,
    setPreviewPageMetrics,
    syntheticCaretCue,
    type CanvasPageMetrics,
    type PagePtMetrics,
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
    fitPreviewZoomForPageHeight,
    fitPreviewZoomForPageWidth,
    layoutZoomForManualPreviewZoom,
    PREVIEW_FIT_GAP_PX,
    PREVIEW_ZOOM_MAX,
    PREVIEW_ZOOM_MIN,
    type PreviewPageSize,
    type PreviewZoomMode,
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
    zoomMode: PreviewZoomMode;
    onZoomChange: Dispatch<SetStateAction<number>>;
    onZoomModeChange: Dispatch<SetStateAction<PreviewZoomMode>>;
    onExport: (format: import("../../../bindings/ExportFormat").ExportFormat) => void | Promise<void>;
    scrollRef?: RefObject<HTMLDivElement | null>;
}

export const Preview = ({
    compiler,
    zoom,
    zoomMode,
    onZoomChange,
    onZoomModeChange,
    onExport,
    scrollRef,
}: PreviewProps) => {
    const { documentFocus } = useDocumentFocus();
    const dispatchAction = useActionDispatcher();
    const { previewPages, sourceMap, previewRevision } = compiler;
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
    const fallbackScrollRef = useRef<HTMLDivElement>(null);
    const previewScrollRef = scrollRef ?? fallbackScrollRef;
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [renderedPageMetrics, setRenderedPageMetrics] = useState<
        Record<number, PagePtMetrics>
    >({});
    const [renderedSvgPages, setRenderedSvgPages] = useState<
        Record<number, RenderedSvgPage>
    >({});
    const renderedSvgPagesRef = useRef<Record<number, RenderedSvgPage>>({});
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

    useLayoutEffect(() => {
        const element = previewScrollRef.current;
        if (!element) {
            return;
        }

        const syncViewportSize = () => {
            const rect = element.getBoundingClientRect();
            setViewportSize({
                width: rect.width || element.clientWidth,
                height: rect.height || element.clientHeight,
            });
        };

        syncViewportSize();
        const observer = new ResizeObserver(syncViewportSize);
        observer.observe(element);
        return () => observer.disconnect();
    }, [previewScrollRef]);

    const previewPageSizes = useMemo<PreviewPageSize[]>(() => {
        return previewPages.map((page) => {
            const pageMetrics = renderedPageMetrics[page.page_number];
            return {
                widthPt: page.width_pt ?? pageMetrics?.widthPt ?? 0,
                heightPt: page.height_pt ?? pageMetrics?.heightPt ?? 0,
            };
        });
    }, [previewPages, renderedPageMetrics]);

    const fallbackPageSize = useMemo<PreviewPageSize>(
        () => ({ widthPt: 612, heightPt: 792 }),
        [],
    );
    const activePageNumber =
        highlightedPosition?.pageNumber ?? previewPages[0]?.page_number ?? null;
    const activePageSize =
        previewPageSizes[
            previewPages.findIndex((page) => page.page_number === activePageNumber)
        ] ?? previewPageSizes[0] ?? fallbackPageSize;
    const pagesForManualZoom =
        previewPageSizes.length > 0 ? previewPageSizes : [fallbackPageSize];
    const manualLayoutZoom =
        viewportSize.width > 0
            ? layoutZoomForManualPreviewZoom({
                  manualZoom: zoom,
                  pages: pagesForManualZoom,
                  viewportWidthPx: viewportSize.width,
              })
            : zoom;
    const fitWidthZoom =
        viewportSize.width > 0
            ? fitPreviewZoomForPageWidth(
                  viewportSize.width,
                  activePageSize,
                  PREVIEW_FIT_GAP_PX,
              )
            : zoom;
    const fitHeightZoom =
        viewportSize.height > 0
            ? fitPreviewZoomForPageHeight(
                  viewportSize.height,
                  activePageSize,
                  PREVIEW_FIT_GAP_PX,
              )
            : zoom;
    const effectiveZoom =
        zoomMode === "fit-width"
            ? fitWidthZoom
            : zoomMode === "fit-height"
              ? fitHeightZoom
              : manualLayoutZoom;
    const manualEquivalentZoom =
        manualLayoutZoom > 0 ? (effectiveZoom / manualLayoutZoom) * zoom : zoom;
    const zoomPercent = formatPreviewZoomPercent(zoom);
    const canZoomOut = manualEquivalentZoom > PREVIEW_ZOOM_MIN;
    const canZoomIn = manualEquivalentZoom < PREVIEW_ZOOM_MAX;
    const manualZoomFromInteraction = useCallback(
        (update: SetStateAction<number>) => {
            onZoomModeChange("manual");
            onZoomChange(() => {
                const next =
                    typeof update === "function"
                        ? update(manualEquivalentZoom)
                        : update;
                return Math.min(
                    PREVIEW_ZOOM_MAX,
                    Math.max(PREVIEW_ZOOM_MIN, next),
                );
            });
        },
        [manualEquivalentZoom, onZoomChange, onZoomModeChange],
    );

    const { setZoomAnchor } = usePreviewZoomInput(
        previewScrollRef,
        effectiveZoom,
        manualZoomFromInteraction,
    );

    useLayoutEffect(() => {
        syncCaretScrollToLayout(effectiveZoom);
    }, [syncCaretScrollToLayout, effectiveZoom]);

    const [isZoomMenuOpen, setZoomMenuOpen] = useState(false);
    const [isEditingZoom, setEditingZoom] = useState(false);
    const [zoomDraft, setZoomDraft] = useState(String(zoomPercent));
    const zoomOptions = useMemo(
        () =>
            Array.from({ length: 26 }, (_, index) => {
                const percent = 50 + index * 10;
                return { percent, value: percent / 100 };
            }),
        [],
    );

    const applyManualZoom = useCallback(
        (value: number) => {
            onZoomModeChange("manual");
            onZoomChange(value);
            setZoomMenuOpen(false);
        },
        [onZoomChange, onZoomModeChange],
    );

    const commitZoomDraft = useCallback(() => {
        const percent = Number(zoomDraft);
        if (!Number.isFinite(percent)) {
            setEditingZoom(false);
            return;
        }
        applyManualZoom(percent / 100);
        setEditingZoom(false);
    }, [applyManualZoom, zoomDraft]);

    const zoomLabel =
        zoomMode === "fit-width"
            ? m.preview_zoom_fit_width()
            : zoomMode === "fit-height"
              ? m.preview_zoom_fit_height()
              : m.preview_zoom_level({ percent: zoomPercent });

    return (
        <aside
            className={styles.preview}
            data-active-source-label={activeSource?.label}
            data-editor-focus-lose-exempt=""
            onClick={handlePreviewClick}
        >
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
                        manualZoomFromInteraction((current) =>
                            stepPreviewZoom(current, -1),
                        );
                    }}
                >
                    <ZoomOut24Regular />
                </button>
                <div className={styles.zoomMenuRoot}>
                    {isEditingZoom ? (
                        <input
                            autoFocus
                            aria-label={m.preview_zoom_custom()}
                            className={toolbarStyles.zoomLabel}
                            inputMode="decimal"
                            type="number"
                            value={zoomDraft}
                            onBlur={commitZoomDraft}
                            onChange={(event) => setZoomDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    commitZoomDraft();
                                }
                                if (event.key === "Escape") {
                                    setEditingZoom(false);
                                }
                            }}
                        />
                    ) : (
                        <button
                            type="button"
                            tabIndex={-1}
                            className={toolbarStyles.zoomLabel}
                            title={m.preview_zoom_options()}
                            aria-label={m.preview_zoom_options()}
                            aria-haspopup="menu"
                            aria-expanded={isZoomMenuOpen}
                            onClick={() => setZoomMenuOpen((open) => !open)}
                            onDoubleClick={() => {
                                setZoomDraft(String(zoomPercent));
                                setZoomMenuOpen(false);
                                setEditingZoom(true);
                            }}
                        >
                            {zoomLabel}
                        </button>
                    )}
                    {isZoomMenuOpen && (
                        <div
                            aria-label={m.preview_zoom_options()}
                            className={styles.zoomMenu}
                            role="menu"
                        >
                            <button
                                role="menuitem"
                                type="button"
                                onClick={() => {
                                    onZoomModeChange("fit-width");
                                    setZoomMenuOpen(false);
                                }}
                            >
                                {m.preview_zoom_fit_width()}
                            </button>
                            <button
                                role="menuitem"
                                type="button"
                                onClick={() => {
                                    onZoomModeChange("fit-height");
                                    setZoomMenuOpen(false);
                                }}
                            >
                                {m.preview_zoom_fit_height()}
                            </button>
                            {zoomOptions.map((option) => (
                                <button
                                    key={option.percent}
                                    role="menuitem"
                                    type="button"
                                    onClick={() => applyManualZoom(option.value)}
                                >
                                    {m.preview_zoom_level({
                                        percent: option.percent,
                                    })}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    tabIndex={-1}
                    className={toolbarStyles.toolbarButton}
                    title={m.menubar_zoom_in()}
                    aria-label={m.menubar_zoom_in()}
                    disabled={!canZoomIn}
                    onClick={() => {
                        setZoomAnchor();
                        manualZoomFromInteraction((current) =>
                            stepPreviewZoom(current, 1),
                        );
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
                    <div
                        className={styles.scrollAreaInner}
                        data-scroll-region-x
                    >
                    <div className={styles.svgContainer}>
                        {previewPages.length > 0 && previewRevision !== null ? (
                            previewPages.map((page, index) => {
                                const pageNumber = page.page_number;
                                const initialMetrics =
                                    page.width_pt && page.height_pt
                                        ? {
                                              widthPt: page.width_pt,
                                              heightPt: page.height_pt,
                                          }
                                        : renderedPageMetrics[pageNumber] ?? null;
                                return (
                                    <PreviewPageSvg
                                        key={pageNumber}
                                        changed={page.changed}
                                        cachedPage={
                                            renderedSvgPages[pageNumber] ??
                                            renderedSvgPagesRef.current[pageNumber] ??
                                            null
                                        }
                                        initialMetrics={initialMetrics}
                                        pageIndex={index}
                                        pageNumber={pageNumber}
                                        previewRevision={previewRevision}
                                        highlightedPosition={highlightedPosition}
                                        zoom={effectiveZoom}
                                        previewScrollRef={previewScrollRef}
                                        onPageRendered={scrollCaretAfterPageRender}
                                        onPagePainted={onFirstPagePainted}
                                        onPageMetrics={(metrics) =>
                                            setRenderedPageMetrics((current) => ({
                                                ...current,
                                                [pageNumber]: metrics,
                                            }))
                                        }
                                        onPageSvg={(renderedPage) => {
                                            renderedSvgPagesRef.current = {
                                                ...renderedSvgPagesRef.current,
                                                [pageNumber]: renderedPage,
                                            };
                                            setRenderedSvgPages((current) => ({
                                                ...current,
                                                [pageNumber]: renderedPage,
                                            }));
                                        }}
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

interface PreviewPageSvgProps {
    changed: boolean;
    cachedPage: RenderedSvgPage | null;
    initialMetrics: PagePtMetrics | null;
    pageIndex: number;
    pageNumber: number;
    previewRevision: number;
    zoom: number;
    previewScrollRef: RefObject<HTMLElement | null>;
    highlightedPosition: PreviewElementPosition | null;
    onPageRendered: (pageNumber: number) => void;
    onPagePainted: () => void;
    onPageMetrics: (metrics: PagePtMetrics) => void;
    onPageSvg: (renderedPage: RenderedSvgPage) => void;
}

interface RenderedSvgPage {
    revision: number;
    svg: string;
    metrics: CanvasPageMetrics;
}

const PreviewPageSvg = ({
    changed,
    cachedPage,
    initialMetrics,
    pageIndex,
    pageNumber,
    previewRevision,
    zoom,
    previewScrollRef,
    highlightedPosition,
    onPageRendered,
    onPagePainted,
    onPageMetrics,
    onPageSvg,
}: PreviewPageSvgProps) => {
    const pageRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<HTMLDivElement>(null);
    const renderRequestIdRef = useRef(0);
    const hasRenderedRef = useRef(false);
    const lastRenderedRevisionRef = useRef<number | null>(null);
    const [pageMetrics, setPageMetrics] = useState<PagePtMetrics | null>(
        initialMetrics,
    );
    const needsCaretRender =
        highlightedPosition?.pageNumber === pageNumber &&
        highlightedPosition.caretCue !== null;

    useEffect(() => {
        if (initialMetrics) {
            setPageMetrics(initialMetrics);
        }
    }, [initialMetrics]);

    const isInViewport = useInViewport(pageRef, {
        rootRef: previewScrollRef,
        forceVisible: needsCaretRender,
    });

    useEffect(() => {
        const element = svgRef.current;
        if (!element || !isInViewport) {
            return;
        }

        const needsRender =
            (!hasRenderedRef.current && !cachedPage) ||
            (changed && lastRenderedRevisionRef.current !== previewRevision);
        if (!needsRender) {
            if (!hasRenderedRef.current && cachedPage) {
                element.innerHTML = cachedPage.svg;
                setPreviewPageMetrics(element, cachedPage.metrics);
                setPageMetrics(cachedPage.metrics);
                onPageMetrics(cachedPage.metrics);
                hasRenderedRef.current = true;
                lastRenderedRevisionRef.current = cachedPage.revision;
            }
            onPageRendered(pageNumber);
            onPagePainted();
            return;
        }

        const requestId = renderRequestIdRef.current + 1;
        renderRequestIdRef.current = requestId;
        let cancelled = false;

        void CompilerClient.renderSvgPage(pageIndex, requestId)
            .then((result) => {
                if (cancelled || result.requestId !== renderRequestIdRef.current) {
                    return;
                }

                const metrics = {
                    widthPt: result.widthPt,
                    heightPt: result.heightPt,
                    pixelPerPt: 1,
                };
                element.innerHTML = result.svg;
                setPreviewPageMetrics(element, metrics);
                setPageMetrics(metrics);
                onPageMetrics(metrics);
                onPageSvg({
                    revision: previewRevision,
                    svg: result.svg,
                    metrics,
                });
                hasRenderedRef.current = true;
                lastRenderedRevisionRef.current = previewRevision;
                onPageRendered(pageNumber);
                onPagePainted();
            })
            .catch((err) => {
                console.error("Failed to render page to SVG:", err);
            });

        return () => {
            cancelled = true;
        };
    }, [
        changed,
        cachedPage,
        isInViewport,
        onPageMetrics,
        onPagePainted,
        onPageRendered,
        onPageSvg,
        pageIndex,
        pageNumber,
        previewRevision,
    ]);

    const caretStyle =
        highlightedPosition &&
        highlightedPosition.pageNumber === pageNumber &&
        pageMetrics
            ? caretStyleForPageMetrics(
                  {
                      xPt: highlightedPosition.xPt,
                      caretCue: syntheticCaretCue(highlightedPosition),
                  },
                  pageMetrics,
              )
            : null;
    const surfaceLayout = pageSurfaceLayoutStyle(zoom, pageMetrics);
    const svgStyle = pageMetrics
        ? canvasDisplaySizeStyle(
              zoom,
              {
                  widthPt: pageMetrics.widthPt,
                  heightPt: pageMetrics.heightPt,
                  pixelPerPt: 1,
              },
          )
        : undefined;

    return (
        <div
            ref={pageRef}
            className={styles.page}
            data-preview-page-number={pageNumber}
        >
            <div
                className={styles.pageSurface}
                data-preview-page-surface="true"
                style={surfaceLayout}
            >
                <div
                    ref={svgRef}
                    className={styles.svgPageContent}
                    data-preview-page-content="svg"
                    style={svgStyle}
                />
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
