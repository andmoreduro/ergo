import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS } from "../preview/previewZoom";
import { useTypstCanvasPage } from "./useTypstCanvasPage";

type OffscreenRenderer = {
    attachCanvas: (canvasId: string, canvas: OffscreenCanvas) => Promise<void>;
    detachCanvas: (canvasId: string) => Promise<void>;
    renderPageToCanvas: (
        canvasId: string,
        requestId: number,
        pixelPerPt: number,
    ) => Promise<{
        requestId: number;
        width: number;
        height: number;
    }>;
};

function CanvasProbe({
    zoom,
    renderPage,
    isVisible = true,
    offscreenRenderer,
}: {
    zoom: number;
    renderPage: (requestId: number, pixelPerPt: number) => Promise<{
        requestId: number;
        width: number;
        height: number;
        pixels: Uint8Array;
    }>;
    isVisible?: boolean;
    offscreenRenderer?: OffscreenRenderer;
}) {
    const { canvasRef, canvasStyle } = useTypstCanvasPage(
        renderPage,
        zoom,
        PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS,
        isVisible,
        0,
        1,
        {
            offscreenRenderer,
        },
    );
    return <canvas ref={canvasRef} style={canvasStyle} />;
}

describe("useTypstCanvasPage zoom performance", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("devicePixelRatio", 1);
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            putImageData: vi.fn(),
            imageSmoothingEnabled: true,
        } as unknown as CanvasRenderingContext2D);

        if (typeof global.ImageData === "undefined") {
            (global as typeof globalThis & { ImageData: typeof ImageData }).ImageData =
                class ImageData {
                    width: number;
                    height: number;
                    data: Uint8ClampedArray;
                    constructor(data: Uint8ClampedArray, width: number, height: number) {
                        this.data = data;
                        this.width = width;
                        this.height = height;
                    }
                } as typeof ImageData;
        }
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete (HTMLCanvasElement.prototype as Partial<{
            transferControlToOffscreen: HTMLCanvasElement["transferControlToOffscreen"];
        }>).transferControlToOffscreen;
    });

    it("transfers a visible canvas once and renders future frames in the worker", async () => {
        const offscreen = {} as OffscreenCanvas;
        const transferControlToOffscreen = vi.fn(() => offscreen);
        Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
            configurable: true,
            value: transferControlToOffscreen,
        });

        const offscreenRenderer: OffscreenRenderer = {
            attachCanvas: vi.fn(async () => undefined),
            detachCanvas: vi.fn(async () => undefined),
            renderPageToCanvas: vi.fn(async (_canvasId, requestId, pixelPerPt) => ({
                requestId,
                width: Math.round(100 * pixelPerPt),
                height: Math.round(140 * pixelPerPt),
            })),
        };
        const fallbackRenderPage = vi.fn();

        render(
            <CanvasProbe
                zoom={1}
                renderPage={fallbackRenderPage}
                offscreenRenderer={offscreenRenderer}
            />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
            await Promise.resolve();
        });

        expect(transferControlToOffscreen).toHaveBeenCalledTimes(1);
        expect(offscreenRenderer.attachCanvas).toHaveBeenCalledTimes(1);
        expect(offscreenRenderer.renderPageToCanvas).toHaveBeenCalledTimes(1);
        expect(fallbackRenderPage).not.toHaveBeenCalled();

        const canvas = document.querySelector("canvas")!;
        expect(Number(canvas.dataset.pageWidthPt)).toBeCloseTo(100, 0);
        expect(Number(canvas.dataset.pageHeightPt)).toBeCloseTo(140, 0);
    });

    it("uses explicit Typst page metrics from worker paint results", async () => {
        Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
            configurable: true,
            value: vi.fn(() => ({} as OffscreenCanvas)),
        });
        const offscreenRenderer: OffscreenRenderer = {
            attachCanvas: vi.fn(async () => undefined),
            detachCanvas: vi.fn(async () => undefined),
            renderPageToCanvas: vi.fn(async (_canvasId, requestId, pixelPerPt) => ({
                requestId,
                width: Math.round(100 * pixelPerPt),
                height: Math.round(140 * pixelPerPt),
                widthPt: 148,
                heightPt: 210,
            }) as any),
        };

        render(
            <CanvasProbe
                zoom={1}
                renderPage={vi.fn()}
                offscreenRenderer={offscreenRenderer}
            />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
            await Promise.resolve();
        });

        const canvas = document.querySelector("canvas")!;
        expect(Number(canvas.dataset.pageWidthPt)).toBe(148);
        expect(Number(canvas.dataset.pageHeightPt)).toBe(210);
    });

    it("uses main-thread putImageData when OffscreenCanvas transfer is unavailable", async () => {
        const renderPage = vi.fn(
            async (requestId: number, pixelPerPt: number) => ({
                requestId,
                width: Math.round(100 * pixelPerPt),
                height: Math.round(140 * pixelPerPt),
                pixels: new Uint8Array(
                    Math.round(100 * pixelPerPt) * Math.round(140 * pixelPerPt) * 4,
                ),
            }),
        );

        render(<CanvasProbe zoom={1} renderPage={renderPage} />);

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
            await Promise.resolve();
        });

        expect(renderPage).toHaveBeenCalledTimes(1);
        expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    });

    it("detaches transferred canvases on unmount", async () => {
        Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
            configurable: true,
            value: vi.fn(() => ({} as OffscreenCanvas)),
        });
        const offscreenRenderer: OffscreenRenderer = {
            attachCanvas: vi.fn(async () => undefined),
            detachCanvas: vi.fn(async () => undefined),
            renderPageToCanvas: vi.fn(async (_canvasId, requestId) => ({
                requestId,
                width: 100,
                height: 140,
            })),
        };

        const { unmount } = render(
            <CanvasProbe
                zoom={1}
                renderPage={vi.fn()}
                offscreenRenderer={offscreenRenderer}
            />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
        });
        unmount();

        expect(offscreenRenderer.detachCanvas).toHaveBeenCalledTimes(1);
    });

    it("returns live canvas display size while worker zoom rasterization is debounced", async () => {
        Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
            configurable: true,
            value: vi.fn(() => ({} as OffscreenCanvas)),
        });
        const offscreenRenderer: OffscreenRenderer = {
            attachCanvas: vi.fn(async () => undefined),
            detachCanvas: vi.fn(async () => undefined),
            renderPageToCanvas: vi.fn(async (_canvasId, requestId, pixelPerPt) => ({
                requestId,
                width: Math.round(100 * pixelPerPt),
                height: Math.round(140 * pixelPerPt),
            })),
        };

        const { rerender } = render(
            <CanvasProbe
                zoom={1}
                renderPage={vi.fn()}
                offscreenRenderer={offscreenRenderer}
            />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
            await Promise.resolve();
        });

        const callsAfterMount = offscreenRenderer.renderPageToCanvas.mock.calls.length;
        expect(callsAfterMount).toBe(1);

        rerender(
            <CanvasProbe
                zoom={0.7}
                renderPage={vi.fn()}
                offscreenRenderer={offscreenRenderer}
            />,
        );

        expect(offscreenRenderer.renderPageToCanvas).toHaveBeenCalledTimes(callsAfterMount);
        const canvas = document.querySelector("canvas")!;
        const cssWidth = Number.parseFloat(canvas.style.width);
        expect(cssWidth).toBeGreaterThan(90);
        expect(cssWidth).toBeLessThan(95);
    });

    it("debounces WASM rasterization while applying immediate CSS size", async () => {
        const renderPage = vi.fn(
            async (requestId: number, pixelPerPt: number) => ({
                requestId,
                width: Math.round(100 * pixelPerPt),
                height: Math.round(140 * pixelPerPt),
                pixels: new Uint8Array(
                    Math.round(100 * pixelPerPt) * Math.round(140 * pixelPerPt) * 4,
                ),
            }),
        );

        const { rerender } = render(
            <CanvasProbe zoom={1} renderPage={renderPage} />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
            await Promise.resolve();
        });

        const callsAfterMount = renderPage.mock.calls.length;
        expect(callsAfterMount).toBeGreaterThan(0);

        rerender(<CanvasProbe zoom={0.9} renderPage={renderPage} />);
        rerender(<CanvasProbe zoom={0.8} renderPage={renderPage} />);
        rerender(<CanvasProbe zoom={0.7} renderPage={renderPage} />);

        expect(renderPage.mock.calls.length).toBe(callsAfterMount);

        const canvas = document.querySelector("canvas");
        const cssWidth = Number.parseFloat(canvas?.style.width ?? "0");
        expect(cssWidth).toBeGreaterThan(90);
        expect(cssWidth).toBeLessThan(95);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
            await Promise.resolve();
        });

        expect(renderPage.mock.calls.length).toBe(callsAfterMount + 1);
    });

    it("skips WASM rasterization when the page is outside the viewport", async () => {
        const renderPage = vi.fn(
            async (requestId: number, pixelPerPt: number) => ({
                requestId,
                width: Math.round(100 * pixelPerPt),
                height: Math.round(140 * pixelPerPt),
                pixels: new Uint8Array(
                    Math.round(100 * pixelPerPt) * Math.round(140 * pixelPerPt) * 4,
                ),
            }),
        );

        render(
            <CanvasProbe zoom={1} isVisible={false} renderPage={renderPage} />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
        });

        expect(renderPage).not.toHaveBeenCalled();
    });
});
