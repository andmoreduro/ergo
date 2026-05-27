import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RenderPagePayload } from "../workers/compilerProtocol";
import {
    applyCanvasDisplaySize,
    canvasDisplaySizeStyle,
    DEFAULT_PAGE_WIDTH_PT,
    pixelPerPtForContainerFit,
    pixelPerPtForScreenLayout,
    readCanvasPageMetrics,
    setCanvasPageMetrics,
    type CanvasPageMetrics,
    type ContainerFitPx,
} from "../preview/canvasMetrics";
import { useDebouncedValue } from "./useDebouncedValue";

type RenderPage = (requestId: number, pixelPerPt: number) => Promise<RenderPagePayload>;

type RenderCanvasResult = {
    requestId: number;
    width: number;
    height: number;
};

type OffscreenCanvasRenderer = {
    attachCanvas: (canvasId: string, canvas: OffscreenCanvas) => Promise<void>;
    detachCanvas: (canvasId: string) => Promise<void>;
    renderPageToCanvas: (
        canvasId: string,
        requestId: number,
        pixelPerPt: number,
    ) => Promise<RenderCanvasResult>;
};

let nextCanvasId = 0;

export function putTypstPageOnCanvas(
    canvas: HTMLCanvasElement,
    result: RenderPagePayload,
    metrics: CanvasPageMetrics,
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }

    ctx.imageSmoothingEnabled = false;

    canvas.width = result.width;
    canvas.height = result.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${result.width / dpr}px`;
    canvas.style.height = `${result.height / dpr}px`;

    const imgData = new ImageData(
        new Uint8ClampedArray(
            result.pixels.buffer,
            result.pixels.byteOffset,
            result.pixels.byteLength,
        ),
        result.width,
        result.height,
    );
    ctx.putImageData(imgData, 0, 0);
    setCanvasPageMetrics(canvas, metrics);
}

function updateCanvasMetricsAfterWorkerPaint(
    canvas: HTMLCanvasElement,
    result: RenderCanvasResult,
    metrics: CanvasPageMetrics,
): void {
    canvas.width = result.width;
    canvas.height = result.height;

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${result.width / dpr}px`;
    canvas.style.height = `${result.height / dpr}px`;
    setCanvasPageMetrics(canvas, metrics);
}

function hasPixels(
    result: RenderPagePayload | RenderCanvasResult,
): result is RenderPagePayload {
    return "pixels" in result;
}

export function useTypstCanvasPage(
    renderPage: RenderPage,
    zoom: number,
    renderDebounceMs: number,
    isVisible: boolean,
    pageIndex: number,
    previewRevision: number,
    options?: {
        onError?: (error: unknown) => void;
        onRendered?: () => void;
        /** When set, scale pages to this container (resource thumbnails). */
        fitWidthPx?: number;
        fitHeightPx?: number;
        offscreenRenderer?: OffscreenCanvasRenderer;
    },
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const canvasIdRef = useRef<string | null>(null);
    const offscreenAttachedRef = useRef(false);
    const offscreenFailedRef = useRef(false);
    const renderRequestIdRef = useRef(0);
    const renderPageRef = useRef(renderPage);
    renderPageRef.current = renderPage;
    const offscreenRendererRef = useRef(options?.offscreenRenderer);
    offscreenRendererRef.current = options?.offscreenRenderer;
    const onRenderedRef = useRef(options?.onRendered);
    const onErrorRef = useRef(options?.onError);
    onRenderedRef.current = options?.onRendered;
    onErrorRef.current = options?.onError;
    const [pageWidthPt, setPageWidthPt] = useState<number | null>(null);
    const [pageHeightPt, setPageHeightPt] = useState<number | null>(null);

    const fitWidthPx = options?.fitWidthPx;
    const fitHeightPx = options?.fitHeightPx;
    const hasContainerFit = fitWidthPx !== undefined;
    const renderZoom = useDebouncedValue(zoom, renderDebounceMs);
    const renderFitWidthPx = useDebouncedValue(fitWidthPx ?? 0, renderDebounceMs);
    const layoutPageWidthPt = pageWidthPt ?? DEFAULT_PAGE_WIDTH_PT;
    const layoutPageHeightPt = pageHeightPt ?? layoutPageWidthPt;
    // Thumbnails must use the live container width; debouncing fit width would
    // rasterize once at full page size before the sidebar width is known.
    const layoutFitWidthPx = hasContainerFit ? (fitWidthPx ?? 0) : renderFitWidthPx;
    const layoutFitHeightPx = fitHeightPx ?? 0;
    const usesContainerFit = layoutFitWidthPx > 0;

    const ensureOffscreenCanvas = useCallback(async () => {
        const canvas = canvasRef.current;
        const renderer = offscreenRendererRef.current;
        if (
            !canvas ||
            !renderer ||
            offscreenAttachedRef.current ||
            offscreenFailedRef.current ||
            typeof canvas.transferControlToOffscreen !== "function"
        ) {
            return offscreenAttachedRef.current ? canvasIdRef.current : null;
        }

        try {
            const canvasId =
                canvasIdRef.current ??
                `typst-canvas-${String(nextCanvasId++).padStart(4, "0")}`;
            canvasIdRef.current = canvasId;
            const offscreen = canvas.transferControlToOffscreen();
            await renderer.attachCanvas(canvasId, offscreen);
            offscreenAttachedRef.current = true;
            return canvasId;
        } catch (error) {
            offscreenFailedRef.current = true;
            onErrorRef.current?.(error);
            return null;
        }
    }, []);

    const containerFit = useMemo<ContainerFitPx | undefined>(
        () =>
            usesContainerFit
                ? {
                      widthPx: layoutFitWidthPx,
                      heightPx: layoutFitHeightPx > 0 ? layoutFitHeightPx : undefined,
                  }
                : undefined,
        [layoutFitHeightPx, layoutFitWidthPx, usesContainerFit],
    );

    const pixelPerPt = containerFit
        ? pixelPerPtForContainerFit(
              layoutPageWidthPt,
              layoutPageHeightPt,
              containerFit,
              renderZoom,
        )
        : pixelPerPtForScreenLayout(layoutPageWidthPt, renderZoom);
    const canvasStyle =
        pageWidthPt !== null && pageHeightPt !== null
            ? canvasDisplaySizeStyle(
                  zoom,
                  {
                      widthPt: pageWidthPt,
                      heightPt: pageHeightPt,
                      pixelPerPt,
                  },
                  containerFit,
              )
            : undefined;

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || zoom <= 0) {
            return;
        }

        const metrics = readCanvasPageMetrics(canvas);
        if (!metrics) {
            return;
        }

        applyCanvasDisplaySize(canvas, zoom, metrics, containerFit);
    }, [containerFit, usesContainerFit, zoom]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isVisible) {
            return;
        }

        if (hasContainerFit && layoutFitWidthPx <= 0) {
            return;
        }

        const requestId = renderRequestIdRef.current + 1;
        renderRequestIdRef.current = requestId;

        let cancelled = false;

        void (async () => {
            const canvasId = await ensureOffscreenCanvas();
            const renderer = offscreenRendererRef.current;
            const result =
                canvasId && renderer
                    ? await renderer.renderPageToCanvas(
                          canvasId,
                          requestId,
                          pixelPerPt,
                      )
                    : await renderPageRef.current(requestId, pixelPerPt);

                if (cancelled || result.requestId !== renderRequestIdRef.current) {
                    return;
                }

                const widthPt = result.width / pixelPerPt;
                const heightPt = result.height / pixelPerPt;
                setPageWidthPt(widthPt);
                setPageHeightPt(heightPt);
                const metrics = {
                    widthPt,
                    heightPt,
                    pixelPerPt,
                };
                if (hasPixels(result)) {
                    putTypstPageOnCanvas(canvas, result, metrics);
                } else {
                    updateCanvasMetricsAfterWorkerPaint(canvas, result, metrics);
                }
                applyCanvasDisplaySize(
                    canvas,
                    zoom,
                    metrics,
                    containerFit,
                );
                onRenderedRef.current?.();
        })().catch((error) => {
            onErrorRef.current?.(error);
        });

        return () => {
            cancelled = true;
        };
    }, [
        containerFit,
        ensureOffscreenCanvas,
        hasContainerFit,
        isVisible,
        layoutFitWidthPx,
        pageIndex,
        pixelPerPt,
        previewRevision,
    ]);

    useEffect(() => {
        setPageWidthPt(null);
        setPageHeightPt(null);
    }, [pageIndex, previewRevision]);

    useEffect(() => {
        return () => {
            const canvasId = canvasIdRef.current;
            const renderer = offscreenRendererRef.current;
            if (canvasId && offscreenAttachedRef.current && renderer) {
                void renderer.detachCanvas(canvasId);
            }
        };
    }, []);

    return { canvasRef, canvasStyle };
}
