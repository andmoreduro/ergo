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
import { usePreviewSync } from "../../../hooks/usePreviewSync";
import { usePreviewViewportAnchor } from "../../../hooks/usePreviewViewportAnchor";
import { usePreviewZoomInput } from "../../../hooks/usePreviewZoomInput";
import {
    clearPreviewPointerAnchor,
    updatePreviewPointerAnchor,
} from "../../../preview/previewPointerAnchor";
import {
    CSS_PX_PER_PT,
    DEFAULT_PAGE_HEIGHT_PT,
    DEFAULT_PAGE_WIDTH_PT,
    pageSurfaceLayoutStyle,
    type PagePtMetrics,
} from "../../../preview/previewPageMetrics";
import { useInViewport } from "../../../hooks/useInViewport";
import { nowMs, type PagePaintInfo } from "../../../hooks/previewTelemetry";
import { CanvasPreview } from "../../molecules/CanvasPreview/CanvasPreview";
import { CompilerClient } from "../../../workers/compilerClient";
import { isDebugMenuEnabled } from "../../../config/debug";
import { useDocumentFocusSelector } from "../../../state/DocumentContext";
import { usePreviewCaret, type PreviewCaret } from "../../../hooks/usePreviewCaret";
import type { useCompiler } from "../../../hooks/useCompiler";
import { useActionDispatcher } from "../../../actions/runtime";
import { PreviewContext } from "../../../actions/contexts/PreviewContext";
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
    /** Draft resolution factor for preview pages while typing (1 = full res). */
    draftRenderFactor: number;
    /** Fraction of the viewport rasterized beyond the visible edges (0 = exact). */
    renderOverscanFactor: number;
    /** Milliseconds to debounce zoom sharpening re-rasterization. */
    rasterizationDebounceMs: number;
    /** Milliseconds to debounce scroll/zoom-out reveal re-rasterization. */
    revealDebounceMs: number;
    /** Milliseconds to debounce resolving the editor caret's preview position. */
    forwardSyncDebounceMs: number;
    /** Milliseconds an idle draft render waits before promoting to full res. */
    draftPromoteMs: number;
    /** Draw a caret cue at every visible rendered spot, not just the nearest. */
    multiCaret: boolean;
}

export const Preview = ({
    compiler,
    zoom,
    zoomMode,
    onZoomChange,
    onZoomModeChange,
    onExport,
    scrollRef,
    draftRenderFactor,
    renderOverscanFactor,
    rasterizationDebounceMs,
    revealDebounceMs,
    forwardSyncDebounceMs,
    draftPromoteMs,
    multiCaret,
}: PreviewProps) => {
    const dispatchAction = useActionDispatcher();
    const {
        previewPages,
        sourceMap,
        previewRevision,
        markMainPreviewPainted,
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

    // Keep the current revision in a ref so the paint callback can stay stable
    // and avoid churning the memoized page components on every revision bump.
    const previewRevisionRef = useRef(previewRevision);
    previewRevisionRef.current = previewRevision;

    // Probe: timestamp when React finishes committing this revision (after DOM
    // mutation, before the browser paints). Splits `commit` (previewRenderAt →
    // page passive effect) into React render+commit vs browser paint, to locate
    // the part that grows with document size.
    const reactCommittedAtRef = useRef<{ revision: number; at: number } | null>(
        null,
    );
    useLayoutEffect(() => {
        if (previewRevision !== null) {
            reactCommittedAtRef.current = {
                revision: previewRevision,
                at: nowMs(),
            };
        }
    }, [previewRevision]);

    // Depend on the stable `markMainPreviewPainted`, NOT the whole `compiler`
    // object: `compiler` changes identity whenever telemetry updates, which would
    // churn this callback → re-run the page effect → re-finalize telemetry in a
    // loop. `markMainPreviewPainted` is itself idempotent per revision.
    const onFirstPagePainted = useCallback(
        (paintInfo: PagePaintInfo) => {
            const revision = previewRevisionRef.current;
            if (revision === null) {
                return;
            }
            const renderAt = previewRenderAtRef.current;
            const committedAt = reactCommittedAtRef.current;
            markMainPreviewPainted(revision, {
                ...paintInfo,
                previewRenderAt:
                    renderAt?.revision === revision ? renderAt.at : null,
                reactCommittedAt:
                    committedAt?.revision === revision ? committedAt.at : null,
            });
        },
        [markMainPreviewPainted],
    );
    const showTelemetry =
        isDebugMenuEnabled() && compiler.previewTelemetry !== null;
    const fallbackScrollRef = useRef<HTMLDivElement>(null);
    const previewScrollRef = scrollRef ?? fallbackScrollRef;
    const horizontalScrollRef = useRef<HTMLDivElement>(null);
    const previewColumnRef = useRef<HTMLElement>(null);
    const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
    const [renderedPageMetrics, setRenderedPageMetrics] = useState<
        Record<number, PagePtMetrics>
    >({});
    const pageMetricsCacheRef = useRef<Record<number, PagePtMetrics>>({});
    const focusElementId = useDocumentFocusSelector((focus) => focus.elementId);
    // Viewport page geometry, tracked by a single IntersectionObserver and shared
    // by forward-sync resolution and the content-change scroll — so neither has to
    // sweep page rects (a full reflow) on every keystroke.
    const { anchorPageRef, centerPageRef, pageVisibilityRef } =
        usePreviewViewportAnchor(previewScrollRef, previewPages);
    // True while the user has scrolled the caret's page out of view; switches
    // forward sync from "follow the caret" to "search from the viewport center"
    // and suppresses the content-change scroll so the view isn't yanked back.
    const userScrolledAwayRef = useRef(false);
    // Forward sync: where the editor caret currently lands in the preview.
    const {
        caret: previewCaret,
        carets: previewCarets,
        resolvedRevision: previewCaretRevision,
    } = usePreviewCaret({
        previewRevision,
        debounceMs: forwardSyncDebounceMs,
        centerPageRef,
        userScrolledAwayRef,
        multiCaret,
    });
    const activeSource = useMemo(
        () => sourceMap.find((entry) => entry.elementId === focusElementId),
        [focusElementId, sourceMap],
    );

    // Group cues by page so each page gets a stable array reference (an unchanged
    // page keeps the shared empty array and skips re-render via the memo below).
    const caretsByPage = useMemo(() => {
        const byPage = new Map<number, PreviewCaret[]>();
        for (const caret of previewCarets) {
            const list = byPage.get(caret.pageNumber);
            if (list) {
                list.push(caret);
            } else {
                byPage.set(caret.pageNumber, [caret]);
            }
        }
        return byPage;
    }, [previewCarets]);

    const { handlePreviewClick } = usePreviewSync({
        scrollRef: previewScrollRef,
        previewRevision,
        previewPages,
        dispatchAction,
        caret: previewCaret,
        caretRevision: previewCaretRevision,
        zoom,
        anchorPageRef,
        pageVisibilityRef,
        userScrolledAwayRef,
    });

    const handlePageMetrics = useCallback(
        (pageNumber: number, metrics: PagePtMetrics) =>
            setRenderedPageMetrics((current) => ({
                ...current,
                [pageNumber]: metrics,
            })),
        [],
    );
    // Stable per-page initial metrics so memoized page components keep the same
    // prop identity between keystrokes (reuse cached objects when values match).
    const initialMetricsByPage = useMemo(() => {
        const cache = pageMetricsCacheRef.current;
        const map: Record<number, PagePtMetrics | null> = {};
        for (const page of previewPages) {
            if (page.width_pt && page.height_pt) {
                const existing = cache[page.page_number];
                if (
                    existing &&
                    existing.widthPt === page.width_pt &&
                    existing.heightPt === page.height_pt
                ) {
                    map[page.page_number] = existing;
                } else {
                    const metrics = {
                        widthPt: page.width_pt,
                        heightPt: page.height_pt,
                    };
                    cache[page.page_number] = metrics;
                    map[page.page_number] = metrics;
                }
            } else {
                map[page.page_number] =
                    renderedPageMetrics[page.page_number] ?? null;
            }
        }
        return map;
    }, [previewPages, renderedPageMetrics]);

    // Drop metrics for page numbers no longer in the compile result (e.g. after
    // opening a shorter project). Also clear caches while revision is unset.
    useEffect(() => {
        if (previewRevision === null) {
            setRenderedPageMetrics({});
            return;
        }

        const activePageNumbers = new Set(
            previewPages.map((page) => page.page_number),
        );

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
    }, [previewRevision, previewPages]);

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
    const activePageNumber = previewPages[0]?.page_number ?? null;
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

    usePreviewZoomInput(
        previewScrollRef,
        horizontalScrollRef,
        previewColumnRef,
        effectiveZoom,
        manualZoomFromInteraction,
    );

    useEffect(() => {
        const column = previewColumnRef.current;
        if (!column) {
            return;
        }

        const onPointerMove = (event: PointerEvent) => {
            updatePreviewPointerAnchor(
                event.clientX,
                event.clientY,
                true,
            );
        };

        const onPointerLeave = () => {
            clearPreviewPointerAnchor();
        };

        column.addEventListener("pointermove", onPointerMove);
        column.addEventListener("pointerleave", onPointerLeave);
        return () => {
            column.removeEventListener("pointermove", onPointerMove);
            column.removeEventListener("pointerleave", onPointerLeave);
            clearPreviewPointerAnchor();
        };
    }, []);

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

    const [previewFocused, setPreviewFocused] = useState(false);

    return (
        <PreviewContext active={previewFocused}>
        <aside
            ref={previewColumnRef}
            className={styles.preview}
            data-active-source-label={activeSource?.label}
            data-editor-focus-lose-exempt=""
            onClick={handlePreviewClick}
            onFocusCapture={() => setPreviewFocused(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setPreviewFocused(false);
                }
            }}
        >
            <Toolbar onClick={(event) => event.stopPropagation()}>
                <IconButton
                    tabIndex={-1}
                    title={m.menubar_zoom_out()}
                    aria-label={m.menubar_zoom_out()}
                    disabled={!canZoomOut}
                    onClick={() => {
                        void dispatchAction({
                            id: "view::ZoomOut",
                            payload: null,
                        });
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
                        void dispatchAction({
                            id: "view::ZoomIn",
                            payload: null,
                        });
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
                    <div
                        className={styles.scrollAreaInner}
                        ref={horizontalScrollRef}
                    >
                    <div className={styles.svgContainer}>
                        {previewPages.length > 0 && previewRevision !== null ? (
                            previewPages.map((page, index) => {
                                const pageNumber = page.page_number;
                                return (
                                    <PreviewPageCanvas
                                        key={pageNumber}
                                        changed={page.changed}
                                        initialMetrics={
                                            initialMetricsByPage[pageNumber] ?? null
                                        }
                                        pageIndex={index}
                                        pageNumber={pageNumber}
                                        previewRevision={previewRevision}
                                        zoom={effectiveZoom}
                                        draftFactor={draftRenderFactor}
                                        idlePromoteMs={draftPromoteMs}
                                        overscanFactor={renderOverscanFactor}
                                        rasterizationDebounceMs={
                                            rasterizationDebounceMs
                                        }
                                        revealDebounceMs={revealDebounceMs}
                                        previewScrollRef={previewScrollRef}
                                        carets={
                                            caretsByPage.get(pageNumber) ??
                                            NO_CARETS
                                        }
                                        onPagePainted={onFirstPagePainted}
                                        onPageMetrics={handlePageMetrics}
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
                        {` · react=${compiler.previewTelemetry.reactCommitMs}ms paint=${compiler.previewTelemetry.paintMs}ms`}
                    </div>
                )}
            </div>
        </aside>
        </PreviewContext>
    );
};

interface PreviewPageCanvasProps {
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

/** Shared stable empty caret list so cue-free pages never re-render. */
const NO_CARETS: PreviewCaret[] = [];

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

const PreviewPageCanvas = memo(
    PreviewPageCanvasComponent,
    previewPageCanvasPropsAreEqual,
);
