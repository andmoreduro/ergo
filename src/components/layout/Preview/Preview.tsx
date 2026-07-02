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
import { usePreviewZoomInput } from "../../../hooks/usePreviewZoomInput";
import { usePreviewForwardSync } from "../../../hooks/usePreviewForwardSync";
import type { PreviewCaret } from "../../../hooks/usePreviewForwardSync";
import {
    clearPreviewPointerAnchor,
    updatePreviewPointerAnchor,
} from "../../../preview/previewPointerAnchor";
import { usePreviewPageMetrics } from "../../../hooks/usePreviewPageMetrics";
import { nowMs, type PagePaintInfo } from "../../../hooks/previewTelemetry";
import { isDebugMenuEnabled } from "../../../config/debug";
import { useDocumentFocusSelector } from "../../../state/DocumentContext";
import type { useCompiler } from "../../../hooks/useCompiler";
import { useActionDispatcher } from "../../../actions/runtime";
import { PreviewContext } from "../../../actions/contexts/PreviewContext";
import { PreviewPageCanvas } from "./PreviewPageCanvas";
import { PreviewToolbar } from "./PreviewToolbar";
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
import styles from "./Preview.module.css";

export type PreviewCompilerState = ReturnType<typeof useCompiler>;

export interface PreviewProps {
    compiler: PreviewCompilerState;
    zoom: number;
    zoomMode: PreviewZoomMode;
    onZoomChange: Dispatch<SetStateAction<number>>;
    onZoomModeChange: Dispatch<SetStateAction<PreviewZoomMode>>;
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
    const focusElementId = useDocumentFocusSelector((focus) => focus.elementId);
    const activeSource = useMemo(
        () => sourceMap.find((entry) => entry.elementId === focusElementId),
        [focusElementId, sourceMap],
    );

    // Forward sync — editor caret → preview cue, viewport anchor tracking, and
    // follow/click-to-source scrolling — coordinated by a single hook so this
    // component doesn't thread the four mutable refs that those pieces share.
    const { caretsByPage, handlePreviewClick } = usePreviewForwardSync({
        scrollRef: previewScrollRef,
        previewRevision,
        previewPages,
        dispatchAction,
        zoom,
        forwardSyncDebounceMs,
        multiCaret,
    });

    // Per-page Typst size: compile result → identity-stable cache → echo-back
    // accumulator, unified in one hook. Exposes both the per-page record (for
    // page components) and the aligned array (for zoom-fit math).
    const { initialMetricsByPage, previewPageSizes, handlePageMetrics } =
        usePreviewPageMetrics(previewPages, previewRevision);

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
        onZoomModeChange,
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

    const applyManualZoom = useCallback(
        (value: number) => {
            void dispatchAction({
                id: "view::SetZoomPercent",
                payload: { percent: Math.round(value * 100) },
            });
        },
        [dispatchAction],
    );

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
            <PreviewToolbar
                canZoomIn={canZoomIn}
                canZoomOut={canZoomOut}
                zoomPercent={zoomPercent}
                zoomLabel={zoomLabel}
                applyManualZoom={applyManualZoom}
                dispatchAction={dispatchAction}
            />
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

/** Shared stable empty caret list so cue-free pages never re-render. */
const NO_CARETS: PreviewCaret[] = [];

