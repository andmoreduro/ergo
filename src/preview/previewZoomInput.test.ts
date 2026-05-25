import { describe, expect, it } from "vitest";
import {
    normalizeWheelDeltaY,
    pointerDistance,
    zoomFromPinchScale,
    zoomFromWheelDelta,
} from "./previewZoomInput";
import { PREVIEW_ZOOM_MAX, PREVIEW_ZOOM_MIN } from "./previewZoom";

describe("previewZoomInput", () => {
    it("zooms in smoothly for negative ctrl-wheel delta", () => {
        const next = zoomFromWheelDelta(1, -100, 0);
        expect(next).toBeGreaterThan(1);
        expect(next).toBeLessThan(1.2);
    });

    it("zooms out smoothly for positive ctrl-wheel delta", () => {
        const next = zoomFromWheelDelta(1, 100, 0);
        expect(next).toBeLessThan(1);
        expect(next).toBeGreaterThan(0.8);
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

    it("normalizes line-mode wheel deltas", () => {
        expect(normalizeWheelDeltaY(3, 1)).toBe(48);
    });

    it("measures pointer distance", () => {
        expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });
});
