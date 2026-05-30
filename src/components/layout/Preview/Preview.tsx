import {
    memo,
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
    pageSurfaceLayoutStyle,
    previewPageDisplaySizeStyle,
    setPreviewPageMetrics,
    syntheticCaretCue,
    type PagePtMetrics,
    type PreviewPageMetrics,
} from "../../../preview/previewPageMetrics";
import { useInViewport } from "../../../hooks/useInViewport";
import {
    afterNextPaint,
    elapsedMs,
    nowMs,
    type PagePaintInfo,
} from "../../../hooks/previewTelemetry";
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
import { IconButton } from "../../atoms/IconButton/IconButton";
import { MenuItemButton } from "../../atoms/MenuItemButton/MenuItemButton";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { ToolbarTextButton } from "../../atoms/ToolbarTextButton/ToolbarTextButton";
import { Toolbar, ToolbarSpacer } from "../../molecules/Toolbar/Toolbar";
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
    const { previewPages, sourceMap, previewRevision, markMainPreviewPainted } =
        compiler;

    // Depend on the stable `markMainPreviewPainted`, NOT the whole `compiler`
    // object: `compiler` changes identity whenever telemetry updates, which would
    // churn this callback → re-run the page effect → re-finalize telemetry in a
    // loop. `markMainPreviewPainted` is itself idempotent per revision.
    const onFirstPagePainted = useCallback(
        (paintInfo: PagePaintInfo) => {
            if (previewRevision === null) {
                return;
            }
            markMainPreviewPainted(previewRevision, paintInfo);
        },
        [markMainPreviewPainted, previewRevision],
    );
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

    // Stable per-page callbacks so memoized `PreviewPageSvg` instances aren't
    // re-rendered just because the parent re-rendered (e.g. on every caret move).
    // The page passes its own number back, and the focus-dependent
    // `scrollCaretAfterPageRender` is reached through a ref so its identity churn
    // doesn't leak into the props.
    const scrollCaretRef = useRef(scrollCaretAfterPageRender);
    scrollCaretRef.current = scrollCaretAfterPageRender;
    const handlePageRendered = useCallback(
        (pageNumber: number) => scrollCaretRef.current(pageNumber),
        [],
    );
    const handlePageMetrics = useCallback(
        (pageNumber: number, metrics: PagePtMetrics) =>
            setRenderedPageMetrics((current) => ({
                ...current,
                [pageNumber]: metrics,
            })),
        [],
    );
    const handlePageSvg = useCallback(
        (pageNumber: number, renderedPage: RenderedSvgPage) => {
            renderedSvgPagesRef.current = {
                ...renderedSvgPagesRef.current,
                [pageNumber]: renderedPage,
            };
            setRenderedSvgPages((current) => ({
                ...current,
                [pageNumber]: renderedPage,
            }));
        },
        [],
    );
    // Stable per-page initial metrics so the prop identity is preserved between
    // keystrokes (recomputed only when pages or measured metrics change).
    const initialMetricsByPage = useMemo(() => {
        const map: Record<number, PagePtMetrics | null> = {};
        for (const page of previewPages) {
            map[page.page_number] =
                page.width_pt && page.height_pt
                    ? { widthPt: page.width_pt, heightPt: page.height_pt }
                    : renderedPageMetrics[page.page_number] ?? null;
        }
        return map;
    }, [previewPages, renderedPageMetrics]);

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
    const zoomMenuRootRef = useRef<HTMLDivElement>(null);
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

    useEffect(() => {
        if (!isZoomMenuOpen) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (!zoomMenuRootRef.current?.contains(event.target as Node)) {
                setZoomMenuOpen(false);
            }
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [isZoomMenuOpen]);

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
            <Toolbar onClick={(event) => event.stopPropagation()}>
                <IconButton
                    tabIndex={-1}
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
                </IconButton>
                <div className={styles.zoomMenuRoot} ref={zoomMenuRootRef}>
                    {isEditingZoom ? (
                        <TextInput
                            autoFocus
                            aria-label={m.preview_zoom_custom()}
                            variant="toolbarZoom"
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
                        <ToolbarTextButton
                            tabIndex={-1}
                            variant="zoom"
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
                        </ToolbarTextButton>
                    )}
                    {isZoomMenuOpen && (
                        <div
                            aria-label={m.preview_zoom_options()}
                            className={styles.zoomMenu}
                            data-scroll-region
                            role="menu"
                        >
                            <MenuItemButton
                                role="menuitem"
                                variant="export"
                                onClick={() => {
                                    onZoomModeChange("fit-width");
                                    setZoomMenuOpen(false);
                                }}
                            >
                                {m.preview_zoom_fit_width()}
                            </MenuItemButton>
                            <MenuItemButton
                                role="menuitem"
                                variant="export"
                                onClick={() => {
                                    onZoomModeChange("fit-height");
                                    setZoomMenuOpen(false);
                                }}
                            >
                                {m.preview_zoom_fit_height()}
                            </MenuItemButton>
                            {zoomOptions.map((option) => (
                                <MenuItemButton
                                    key={option.percent}
                                    role="menuitem"
                                    variant="export"
                                    onClick={() => applyManualZoom(option.value)}
                                >
                                    {m.preview_zoom_level({
                                        percent: option.percent,
                                    })}
                                </MenuItemButton>
                            ))}
                        </div>
                    )}
                </div>
                <IconButton
                    tabIndex={-1}
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
                </IconButton>
                <ToolbarSpacer />
                <ExportMenu onExport={onExport} />
            </Toolbar>
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
                                return (
                                    <PreviewPageSvg
                                        key={pageNumber}
                                        changed={page.changed}
                                        cachedPage={
                                            renderedSvgPages[pageNumber] ??
                                            renderedSvgPagesRef.current[pageNumber] ??
                                            null
                                        }
                                        initialMetrics={
                                            initialMetricsByPage[pageNumber] ?? null
                                        }
                                        pageIndex={index}
                                        pageNumber={pageNumber}
                                        previewRevision={previewRevision}
                                        highlightedPosition={
                                            highlightedPosition?.pageNumber ===
                                            pageNumber
                                                ? highlightedPosition
                                                : null
                                        }
                                        zoom={effectiveZoom}
                                        previewScrollRef={previewScrollRef}
                                        onPageRendered={handlePageRendered}
                                        onPagePainted={onFirstPagePainted}
                                        onPageMetrics={handlePageMetrics}
                                        onPageSvg={handlePageSvg}
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
                            render: compiler.previewTelemetry.svgRenderMs,
                            worker: compiler.previewTelemetry.workerRenderMs,
                            dom: compiler.previewTelemetry.domWriteMs,
                            raster: compiler.previewTelemetry.rasterMs,
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
    onPagePainted: (paintInfo: PagePaintInfo) => void;
    onPageMetrics: (pageNumber: number, metrics: PagePtMetrics) => void;
    onPageSvg: (pageNumber: number, renderedPage: RenderedSvgPage) => void;
}

interface RenderedSvgPage {
    revision: number;
    svg: string;
    metrics: PreviewPageMetrics;
}

const PreviewPageSvgComponent = ({
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
    // Timing of the last fresh SVG render, keyed by revision. Paint reports read
    // this so the real worker/dom timing survives even when the page's own cache
    // update re-runs the effect into the no-render branch before the report fires.
    const lastRenderRef = useRef<{
        revision: number;
        workerRenderMs: number;
        domWriteMs: number;
    } | null>(null);
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

        // Report paint after the browser has actually rendered that frame
        // (double-rAF) so the latency total includes real rasterization. The
        // render timing is read from `lastRenderRef` keyed by revision, so a
        // page's own cache-update re-render (which cancels the in-flight report
        // and re-enters the no-render branch) still reports the real worker/dom
        // numbers instead of 0.
        let cancelPaint: (() => void) | undefined;
        const reportPaint = () => {
            const domWrittenAt = nowMs();
            const lastRender = lastRenderRef.current;
            const renderedThisRevision = lastRender?.revision === previewRevision;
            cancelPaint = afterNextPaint(() =>
                onPagePainted({
                    domWrittenAt,
                    workerRenderMs: renderedThisRevision
                        ? lastRender!.workerRenderMs
                        : 0,
                    domWriteMs: renderedThisRevision ? lastRender!.domWriteMs : 0,
                    renderedThisRevision,
                }),
            );
        };

        const needsRender =
            (!hasRenderedRef.current && !cachedPage) ||
            (changed && lastRenderedRevisionRef.current !== previewRevision);
        if (!needsRender) {
            if (!hasRenderedRef.current && cachedPage) {
                element.innerHTML = cachedPage.svg;
                setPreviewPageMetrics(element, cachedPage.metrics);
                setPageMetrics(cachedPage.metrics);
                onPageMetrics(pageNumber, cachedPage.metrics);
                hasRenderedRef.current = true;
                lastRenderedRevisionRef.current = cachedPage.revision;
            }
            onPageRendered(pageNumber);
            reportPaint();
            return () => cancelPaint?.();
        }

        const requestId = renderRequestIdRef.current + 1;
        renderRequestIdRef.current = requestId;
        let cancelled = false;
        const workerStart = nowMs();

        void CompilerClient.renderSvgPage(pageIndex, requestId)
            .then((result) => {
                if (cancelled || result.requestId !== renderRequestIdRef.current) {
                    return;
                }

                const workerRenderMs = elapsedMs(workerStart, nowMs());
                const metrics = {
                    widthPt: result.widthPt,
                    heightPt: result.heightPt,
                    pixelPerPt: 1,
                };
                const writeStart = nowMs();
                element.innerHTML = result.svg;
                const domWriteMs = elapsedMs(writeStart, nowMs());
                lastRenderRef.current = {
                    revision: previewRevision,
                    workerRenderMs,
                    domWriteMs,
                };
                setPreviewPageMetrics(element, metrics);
                setPageMetrics(metrics);
                onPageMetrics(pageNumber, metrics);
                onPageSvg(pageNumber, {
                    revision: previewRevision,
                    svg: result.svg,
                    metrics,
                });
                hasRenderedRef.current = true;
                lastRenderedRevisionRef.current = previewRevision;
                onPageRendered(pageNumber);
                reportPaint();
            })
            .catch((err) => {
                console.error("Failed to render page to SVG:", err);
            });

        return () => {
            cancelled = true;
            cancelPaint?.();
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
        ? previewPageDisplaySizeStyle(
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

/**
 * Memoized so the page list (one instance per page) doesn't re-render on every
 * parent render. With stable callbacks and a per-page `highlightedPosition`,
 * only the page under the caret re-renders when the caret moves — not all pages.
 */
const PreviewPageSvg = memo(PreviewPageSvgComponent);
