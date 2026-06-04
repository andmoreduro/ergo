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
import { useDocumentFocus, useDocumentFocusSelector } from "../../../state/DocumentContext";
import type { useCompiler } from "../../../hooks/useCompiler";
import type { PreviewElementPosition } from "../../../bindings/PreviewElementPosition";
import { useActionDispatcher } from "../../../actions/runtime";
import type { ExportFormat } from "../../../bindings/ExportFormat";
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
import { DropdownMenu } from "../../molecules/DropdownMenu/DropdownMenu";
import {
    ArrowDownload24Regular,
    ChevronDown24Regular,
    ZoomIn24Regular,
    ZoomOut24Regular,
} from "@fluentui/react-icons";

const EXPORT_FORMATS: ExportFormat[] = ["pdf", "png", "svg"];

const exportFormatLabel = (format: ExportFormat): string => {
    switch (format) {
        case "pdf":
            return m.export_format_pdf();
        case "png":
            return m.export_format_png();
        case "svg":
            return m.export_format_svg();
    }
};

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
    const {
        previewPages,
        sourceMap,
        previewRevision,
        markMainPreviewPainted,
        previewSvgPageIndicesRef,
    } = compiler;

    // Timestamp when React starts rendering Preview for a given revision (a ref
    // write during render is safe — idempotent per revision). Lets telemetry split
    // the schedule gap into defer (compile result → this render) vs commit (this
    // render → the page effect).
    const previewRenderAtRef = useRef<{ revision: number; at: number } | null>(
        null,
    );
    if (
        previewRevision !== null &&
        previewRenderAtRef.current?.revision !== previewRevision
    ) {
        previewRenderAtRef.current = { revision: previewRevision, at: nowMs() };
    }

    // Depend on the stable `markMainPreviewPainted`, NOT the whole `compiler`
    // object: `compiler` changes identity whenever telemetry updates, which would
    // churn this callback → re-run the page effect → re-finalize telemetry in a
    // loop. `markMainPreviewPainted` is itself idempotent per revision.
    const onFirstPagePainted = useCallback(
        (paintInfo: PagePaintInfo) => {
            if (previewRevision === null) {
                return;
            }
            const renderAt = previewRenderAtRef.current;
            markMainPreviewPainted(previewRevision, {
                ...paintInfo,
                previewRenderAt:
                    renderAt?.revision === previewRevision ? renderAt.at : null,
            });
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
    const focusElementId = useDocumentFocusSelector((focus) => focus.elementId);
    const activeSource = useMemo(
        () => sourceMap.find((entry) => entry.elementId === focusElementId),
        [focusElementId, sourceMap],
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
    // Track which pages are on screen so the next compile can inline their SVG
    // (see `previewSvgPageIndicesRef`), collapsing the separate render trip for
    // the page the user is actually looking at. Capped so a zoomed-out viewport
    // showing many pages can't balloon the compile result.
    const visiblePageIndicesRef = useRef<Set<number>>(new Set());
    const MAX_INLINE_SVG_PAGES = 4;
    const handlePageVisibilityChange = useCallback(
        (pageIndex: number, visible: boolean) => {
            const set = visiblePageIndicesRef.current;
            if (visible) {
                set.add(pageIndex);
            } else {
                set.delete(pageIndex);
            }
            const indices = [...set]
                .sort((a, b) => a - b)
                .slice(0, MAX_INLINE_SVG_PAGES);
            previewSvgPageIndicesRef.current =
                indices.length > 0 ? indices : [0];
        },
        [previewSvgPageIndicesRef],
    );

    // SVG inlined into the compile result for the visible changed pages. Keyed
    // by page number; consumed by the page view in place of a `renderSvgPage`
    // round-trip. Identity changes only when a new compile arrives.
    const inlineSvgByPage = useMemo(() => {
        const map: Record<number, RenderedSvgPage | null> = {};
        if (previewRevision === null) {
            return map;
        }
        for (const page of previewPages) {
            map[page.page_number] = page.content
                ? {
                      revision: previewRevision,
                      svg: page.content,
                      metrics: {
                          widthPt: page.width_pt ?? 0,
                          heightPt: page.height_pt ?? 0,
                          pixelPerPt: 1,
                      },
                  }
                : null;
        }
        return map;
    }, [previewPages, previewRevision]);

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

    // Drop SVG/metrics for page numbers no longer in the compile result (e.g. after
    // opening a shorter project). Also clear caches while revision is unset.
    useEffect(() => {
        if (previewRevision === null) {
            renderedSvgPagesRef.current = {};
            setRenderedSvgPages({});
            setRenderedPageMetrics({});
            visiblePageIndicesRef.current = new Set([0]);
            previewSvgPageIndicesRef.current = [0];
            return;
        }

        const activePageNumbers = new Set(
            previewPages.map((page) => page.page_number),
        );

        setRenderedSvgPages((current) => {
            let changed = false;
            const next: Record<number, RenderedSvgPage> = {};
            for (const [key, rendered] of Object.entries(current)) {
                const pageNumber = Number(key);
                if (activePageNumbers.has(pageNumber)) {
                    next[pageNumber] = rendered;
                } else {
                    changed = true;
                }
            }
            if (!changed) {
                return current;
            }
            renderedSvgPagesRef.current = next;
            return next;
        });

        setRenderedPageMetrics((current) => {
            let changed = false;
            const next: Record<number, PagePtMetrics> = {};
            for (const [key, metrics] of Object.entries(current)) {
                const pageNumber = Number(key);
                if (activePageNumbers.has(pageNumber)) {
                    next[pageNumber] = metrics;
                } else {
                    changed = true;
                }
            }
            return changed ? next : current;
        });
    }, [previewRevision, previewPages, previewSvgPageIndicesRef]);

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
    const [isExportMenuOpen, setExportMenuOpen] = useState(false);
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
                <div className={styles.zoomMenuRoot}>
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
                        <DropdownMenu
                            align="center"
                            menuLabel={m.preview_zoom_options()}
                            open={isZoomMenuOpen}
                            onOpenChange={setZoomMenuOpen}
                            trigger={
                                <ToolbarTextButton
                                    tabIndex={-1}
                                    variant="zoom"
                                    title={m.preview_zoom_options()}
                                    aria-label={m.preview_zoom_options()}
                                    onDoubleClick={() => {
                                        setZoomDraft(String(zoomPercent));
                                        setZoomMenuOpen(false);
                                        setEditingZoom(true);
                                    }}
                                >
                                    {zoomLabel}
                                </ToolbarTextButton>
                            }
                        >
                            <MenuItemButton
                                role="menuitem"
                                variant="dropdown"
                                onClick={() => {
                                    onZoomModeChange("fit-width");
                                    setZoomMenuOpen(false);
                                }}
                            >
                                {m.preview_zoom_fit_width()}
                            </MenuItemButton>
                            <MenuItemButton
                                role="menuitem"
                                variant="dropdown"
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
                                    variant="dropdown"
                                    onClick={() => applyManualZoom(option.value)}
                                >
                                    {m.preview_zoom_level({
                                        percent: option.percent,
                                    })}
                                </MenuItemButton>
                            ))}
                        </DropdownMenu>
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
                <DropdownMenu
                    align="end"
                    open={isExportMenuOpen}
                    onOpenChange={setExportMenuOpen}
                    trigger={
                        <ToolbarTextButton>
                            <ArrowDownload24Regular aria-hidden />
                            {m.menubar_export()}
                            <ChevronDown24Regular />
                        </ToolbarTextButton>
                    }
                >
                    {EXPORT_FORMATS.map((format) => (
                        <MenuItemButton
                            key={format}
                            role="menuitem"
                            variant="dropdown"
                            onClick={() => {
                                setExportMenuOpen(false);
                                void onExport(format);
                            }}
                        >
                            {exportFormatLabel(format)}
                        </MenuItemButton>
                    ))}
                </DropdownMenu>
            </Toolbar>
            <div className={styles.viewport}>
                <div
                    className={styles.scrollArea}
                    ref={previewScrollRef as RefObject<HTMLDivElement>}
                >
                    <div className={styles.scrollAreaInner}>
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
                                        inlineSvg={
                                            inlineSvgByPage[pageNumber] ?? null
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
                                        onPageVisibilityChange={
                                            handlePageVisibilityChange
                                        }
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
                            defer: compiler.previewTelemetry.deferMs,
                            commit: compiler.previewTelemetry.commitMs,
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
    inlineSvg: RenderedSvgPage | null;
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
    onPageVisibilityChange: (pageIndex: number, visible: boolean) => void;
}

interface RenderedSvgPage {
    revision: number;
    svg: string;
    metrics: PreviewPageMetrics;
}

const PreviewPageSvgComponent = ({
    changed,
    cachedPage,
    inlineSvg,
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
    onPageVisibilityChange,
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

    // Report visibility so the next compile inlines this page's SVG while it's
    // on screen (see `previewSvgPageIndicesRef`).
    useEffect(() => {
        onPageVisibilityChange(pageIndex, isInViewport);
        return () => onPageVisibilityChange(pageIndex, false);
    }, [isInViewport, onPageVisibilityChange, pageIndex]);

    useEffect(() => {
        const effectStartAt = nowMs();
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
                    effectStartAt,
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

        // Fast path: the compile trip already inlined this page's SVG, so paint
        // it synchronously instead of making a second `renderSvgPage` trip.
        if (inlineSvg && inlineSvg.revision === previewRevision) {
            const metrics = inlineSvg.metrics;
            const writeStart = nowMs();
            element.innerHTML = inlineSvg.svg;
            const domWriteMs = elapsedMs(writeStart, nowMs());
            lastRenderRef.current = {
                revision: previewRevision,
                workerRenderMs: 0,
                domWriteMs,
            };
            setPreviewPageMetrics(element, metrics);
            setPageMetrics(metrics);
            onPageMetrics(pageNumber, metrics);
            onPageSvg(pageNumber, {
                revision: previewRevision,
                svg: inlineSvg.svg,
                metrics,
            });
            hasRenderedRef.current = true;
            lastRenderedRevisionRef.current = previewRevision;
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
        inlineSvg,
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

    // Reserve the page's box for `content-visibility: auto` so off-screen pages
    // keep their scroll height without being laid out or painted.
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
 * Unchanged pages ignore global `previewRevision` bumps so compile updates
 * only reconcile pages whose SVG actually changed.
 */
const previewPageSvgPropsAreEqual = (
    prev: PreviewPageSvgProps,
    next: PreviewPageSvgProps,
): boolean => {
    if (
        prev.pageIndex !== next.pageIndex ||
        prev.pageNumber !== next.pageNumber ||
        prev.zoom !== next.zoom ||
        prev.changed !== next.changed ||
        prev.cachedPage !== next.cachedPage ||
        prev.inlineSvg !== next.inlineSvg ||
        prev.initialMetrics !== next.initialMetrics ||
        prev.highlightedPosition !== next.highlightedPosition ||
        prev.previewScrollRef !== next.previewScrollRef ||
        prev.onPageRendered !== next.onPageRendered ||
        prev.onPagePainted !== next.onPagePainted ||
        prev.onPageMetrics !== next.onPageMetrics ||
        prev.onPageSvg !== next.onPageSvg ||
        prev.onPageVisibilityChange !== next.onPageVisibilityChange
    ) {
        return false;
    }
    if (prev.changed && prev.previewRevision !== next.previewRevision) {
        return false;
    }
    return true;
};

const PreviewPageSvg = memo(PreviewPageSvgComponent, previewPageSvgPropsAreEqual);
