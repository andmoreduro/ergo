import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RenderPagePayload } from "../workers/compilerProtocol";
import {
    applyCanvasDisplaySize,
    fallbackPixelPerPt,
    pixelPerPtForScreenLayout,
    readCanvasPageMetrics,
    setCanvasPageMetrics,
    type CanvasPageMetrics,
} from "../preview/canvasMetrics";
import { useDebouncedValue } from "./useDebouncedValue";

type RenderPage = (requestId: number, pixelPerPt: number) => Promise<RenderPagePayload>;

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

export function useTypstCanvasPage(
    renderPage: RenderPage,
    fitWidthPx: number,
    zoom: number,
    renderDebounceMs: number,
    isVisible: boolean,
    pageIndex: number,
    previewRevision: number,
    options?: {
        onError?: (error: unknown) => void;
        onRendered?: () => void;
    },
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderRequestIdRef = useRef(0);
    const renderPageRef = useRef(renderPage);
    renderPageRef.current = renderPage;
    const onRenderedRef = useRef(options?.onRendered);
    const onErrorRef = useRef(options?.onError);
    onRenderedRef.current = options?.onRendered;
    onErrorRef.current = options?.onError;
    const [pageWidthPt, setPageWidthPt] = useState<number | null>(null);

    const renderZoom = useDebouncedValue(zoom, renderDebounceMs);
    const renderFitWidthPx = useDebouncedValue(fitWidthPx, renderDebounceMs);

    const pixelPerPt =
        pageWidthPt && renderFitWidthPx > 0
            ? pixelPerPtForScreenLayout(renderFitWidthPx, pageWidthPt, renderZoom)
            : fallbackPixelPerPt() * renderZoom;

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || fitWidthPx <= 0 || zoom <= 0) {
            return;
        }

        const metrics = readCanvasPageMetrics(canvas);
        if (!metrics) {
            return;
        }

        applyCanvasDisplaySize(canvas, fitWidthPx, zoom, metrics);
    }, [fitWidthPx, zoom]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !isVisible) {
            return;
        }

        const requestId = renderRequestIdRef.current + 1;
        renderRequestIdRef.current = requestId;

        let cancelled = false;

        void renderPageRef.current(requestId, pixelPerPt)
            .then((result) => {
                if (cancelled || result.requestId !== renderRequestIdRef.current) {
                    return;
                }

                const widthPt = result.width / pixelPerPt;
                const heightPt = result.height / pixelPerPt;
                setPageWidthPt(widthPt);
                putTypstPageOnCanvas(canvas, result, {
                    widthPt,
                    heightPt,
                    pixelPerPt,
                });
                applyCanvasDisplaySize(canvas, fitWidthPx, zoom, {
                    widthPt,
                    heightPt,
                    pixelPerPt,
                });
                onRenderedRef.current?.();
            })
            .catch((error) => {
                onErrorRef.current?.(error);
            });

        return () => {
            cancelled = true;
        };
    }, [isVisible, pageIndex, pixelPerPt, previewRevision]);

    return { canvasRef };
}
