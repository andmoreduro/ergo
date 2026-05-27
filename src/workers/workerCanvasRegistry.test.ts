import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    attachWorkerCanvas,
    detachWorkerCanvas,
    paintPageImageToWorkerCanvas,
    resetWorkerCanvasRegistryForTests,
} from "./workerCanvasRegistry";

class FakeOffscreenCanvas {
    width = 0;
    height = 0;
    readonly context = {
        imageSmoothingEnabled: true,
        putImageData: vi.fn(),
    };

    getContext(kind: string) {
        return kind === "2d" ? this.context : null;
    }
}

describe("workerCanvasRegistry", () => {
    beforeEach(() => {
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

    it("attaches a canvas and paints page pixels into it", () => {
        resetWorkerCanvasRegistryForTests();
        const canvas = new FakeOffscreenCanvas();
        attachWorkerCanvas(
            "page-1",
            canvas as unknown as OffscreenCanvas,
        );

        const result = paintPageImageToWorkerCanvas("page-1", {
            width: 2,
            height: 1,
            widthPt: 1,
            heightPt: 0.5,
            pixels: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]),
        });

        expect(result).toEqual({
            width: 2,
            height: 1,
            widthPt: 1,
            heightPt: 0.5,
        });
        expect(canvas.width).toBe(2);
        expect(canvas.height).toBe(1);
        expect(canvas.context.imageSmoothingEnabled).toBe(false);
        expect(canvas.context.putImageData).toHaveBeenCalledTimes(1);
    });

    it("fails clearly when rendering to a detached canvas", () => {
        resetWorkerCanvasRegistryForTests();
        expect(() =>
            paintPageImageToWorkerCanvas("missing", {
                width: 1,
                height: 1,
                pixels: new Uint8Array([0, 0, 0, 0]),
            }),
        ).toThrow("No worker canvas attached for missing");
    });

    it("detaches canvases", () => {
        resetWorkerCanvasRegistryForTests();
        attachWorkerCanvas(
            "page-1",
            new FakeOffscreenCanvas() as unknown as OffscreenCanvas,
        );
        detachWorkerCanvas("page-1");
        expect(() =>
            paintPageImageToWorkerCanvas("page-1", {
                width: 1,
                height: 1,
                pixels: new Uint8Array([0, 0, 0, 0]),
            }),
        ).toThrow("No worker canvas attached for page-1");
    });
});
