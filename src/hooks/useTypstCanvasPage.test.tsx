import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS } from "../preview/previewZoom";
import { useTypstCanvasPage } from "./useTypstCanvasPage";

function CanvasProbe({
    fitWidthPx,
    zoom,
    renderPage,
    isVisible = true,
}: {
    fitWidthPx: number;
    zoom: number;
    renderPage: (requestId: number, pixelPerPt: number) => Promise<{
        requestId: number;
        width: number;
        height: number;
        pixels: Uint8Array;
    }>;
    isVisible?: boolean;
}) {
    const { canvasRef } = useTypstCanvasPage(
        renderPage,
        fitWidthPx,
        zoom,
        PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS,
        isVisible,
        [],
    );
    return <canvas ref={canvasRef} />;
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
            <CanvasProbe fitWidthPx={400} zoom={1} renderPage={renderPage} />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
            await Promise.resolve();
        });

        const callsAfterMount = renderPage.mock.calls.length;
        expect(callsAfterMount).toBeGreaterThan(0);

        rerender(<CanvasProbe fitWidthPx={400} zoom={0.9} renderPage={renderPage} />);
        rerender(<CanvasProbe fitWidthPx={400} zoom={0.8} renderPage={renderPage} />);
        rerender(<CanvasProbe fitWidthPx={400} zoom={0.7} renderPage={renderPage} />);

        expect(renderPage.mock.calls.length).toBe(callsAfterMount);

        const canvas = document.querySelector("canvas");
        expect(canvas?.style.width).toBe("280px");

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
            <CanvasProbe
                fitWidthPx={400}
                zoom={1}
                isVisible={false}
                renderPage={renderPage}
            />,
        );

        await act(async () => {
            await Promise.resolve();
            await vi.advanceTimersByTimeAsync(PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS);
        });

        expect(renderPage).not.toHaveBeenCalled();
    });
});
