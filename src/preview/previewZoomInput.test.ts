import { describe, expect, it } from "vitest";
import {
    clearPreviewPointerAnchor,
    resolvePreviewZoomAnchor,
    updatePreviewPointerAnchor,
} from "./previewPointerAnchor";
import {
    preservePreviewScrollAtClientPoint,
    zoomFromPinchScale,
    zoomFromWheelDelta,
} from "./previewZoomInput";
import { PREVIEW_ZOOM_MAX, PREVIEW_ZOOM_MIN } from "./previewZoom";

describe("previewPointerAnchor", () => {
    it("uses the last pointer position when it is inside the preview column", () => {
        clearPreviewPointerAnchor();
        const scrollRoot = document.createElement("div");
        scrollRoot.getBoundingClientRect = () =>
            ({
                left: 100,
                top: 50,
                right: 500,
                bottom: 650,
                width: 400,
                height: 600,
            }) as DOMRect;

        updatePreviewPointerAnchor(300, 200, true);
        expect(resolvePreviewZoomAnchor(scrollRoot, scrollRoot)).toEqual({
            x: 300,
            y: 200,
        });
    });

    it("falls back to the viewport center when the pointer is outside the preview column", () => {
        clearPreviewPointerAnchor();
        const scrollRoot = document.createElement("div");
        scrollRoot.getBoundingClientRect = () =>
            ({
                left: 100,
                top: 50,
                right: 500,
                bottom: 650,
                width: 400,
                height: 600,
            }) as DOMRect;

        expect(resolvePreviewZoomAnchor(scrollRoot, scrollRoot)).toEqual({
            x: 300,
            y: 350,
        });
    });
});

describe("previewZoomInput", () => {
    it("changes zoom smoothly with ctrl-wheel direction", () => {
        const zoomIn = zoomFromWheelDelta(1, -100, 0);
        expect(zoomIn).toBeGreaterThan(1);
        expect(zoomIn).toBeLessThan(1.2);

        const zoomOut = zoomFromWheelDelta(1, 100, 0);
        expect(zoomOut).toBeLessThan(1);
        expect(zoomOut).toBeGreaterThan(0.8);
    });

    it("clamps wheel zoom to configured bounds", () => {
        expect(zoomFromWheelDelta(PREVIEW_ZOOM_MAX, -5000, 0)).toBe(
            PREVIEW_ZOOM_MAX,
        );
        expect(zoomFromWheelDelta(PREVIEW_ZOOM_MIN, 5000, 0)).toBe(
            PREVIEW_ZOOM_MIN,
        );
    });

    it("applies multiplicative pinch scale", () => {
        expect(zoomFromPinchScale(1, 1.25)).toBe(1.25);
        expect(zoomFromPinchScale(2, 0.5)).toBe(1);
    });

    it("preserves a client point across nested horizontal scroll roots", () => {
        const vertical = document.createElement("div");
        const horizontal = document.createElement("div");
        Object.defineProperty(vertical, "scrollTop", {
            value: 100,
            writable: true,
        });
        Object.defineProperty(horizontal, "scrollLeft", {
            value: 80,
            writable: true,
        });
        vertical.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 400,
                bottom: 600,
                width: 400,
                height: 600,
            }) as DOMRect;
        horizontal.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 400,
                bottom: 600,
                width: 400,
                height: 600,
            }) as DOMRect;

        preservePreviewScrollAtClientPoint(
            vertical,
            1,
            2,
            200,
            300,
            horizontal,
        );

        expect(vertical.scrollTop).toBe(500);
        expect(horizontal.scrollLeft).toBe(360);
    });
});
