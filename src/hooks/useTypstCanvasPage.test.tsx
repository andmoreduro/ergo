import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS } from "../preview/previewZoom";
import { useTypstCanvasPage } from "./useTypstCanvasPage";

function CanvasProbe({
    zoom,
    renderPage,
    isVisible = true,
    onRendered,
    onError,
}: {
    zoom: number;
    renderPage: (requestId: number, pixelPerPt: number) => Promise<{
        requestId: number;
        width: number;
        height: number;
        widthPt?: number;
        heightPt?: number;
        pixels: Uint8Array;
    }>;
    isVisible?: boolean;
    onRendered?: () => void;
    onError?: (error: unknown) => void;
}) {
    const { canvasRef, canvasStyle } = useTypstCanvasPage(
        renderPage,
        zoom,
        PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS,
        isVisible,
        0,
        1,
        {
            onRendered,
            onError,
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

    it("uses main-thread putImageData even when canvas transfer exists", async () => {
        const transferControlToOffscreen = vi.fn(() => ({} as OffscreenCanvas));
        Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
            configurable: true,
            value: transferControlToOffscreen,
        });

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

        expect(transferControlToOffscreen).not.toHaveBeenCalled();
        expect(renderPage).toHaveBeenCalledTimes(1);
        expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalled();
    });

    it("uses explicit Typst page metrics from render results", async () => {
        const renderPage = vi.fn(
            async (requestId: number, pixelPerPt: number) => ({
                requestId,
                width: Math.round(100 * pixelPerPt),
                height: Math.round(140 * pixelPerPt),
                widthPt: 148,
                heightPt: 210,
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

        const canvas = document.querySelector("canvas")!;
        expect(Number(canvas.dataset.pageWidthPt)).toBe(148);
        expect(Number(canvas.dataset.pageHeightPt)).toBe(210);
    });

    it("returns live canvas display size while rasterization is debounced", async () => {
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
        expect(callsAfterMount).toBe(1);

        rerender(<CanvasProbe zoom={0.7} renderPage={renderPage} />);

        expect(renderPage).toHaveBeenCalledTimes(callsAfterMount);
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
