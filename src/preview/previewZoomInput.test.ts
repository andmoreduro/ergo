import { describe, expect, it } from "vitest";
import { zoomFromPinchScale, zoomFromWheelDelta } from "./previewZoomInput";
import { PREVIEW_ZOOM_MAX, PREVIEW_ZOOM_MIN } from "./previewZoom";

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
});
