import { describe, expect, it } from "vitest";
import { pixelPerPtForScreenLayout } from "./canvasMetrics";
import {
    PREVIEW_ZOOM_DEFAULT,
    PREVIEW_ZOOM_MAX,
    PREVIEW_ZOOM_MIN,
    PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS,
    clampPreviewZoom,
    resolvePreviewZoomRenderDebounceMs,
    stepPreviewZoom,
} from "./previewZoom";

describe("previewZoom", () => {
    it("clamps to configured bounds", () => {
        expect(clampPreviewZoom(0.1)).toBe(PREVIEW_ZOOM_MIN);
        expect(clampPreviewZoom(10)).toBe(PREVIEW_ZOOM_MAX);
        expect(clampPreviewZoom(1)).toBe(1);
    });

    it("steps zoom in and out", () => {
        expect(stepPreviewZoom(PREVIEW_ZOOM_DEFAULT, 1)).toBe(1.1);
        expect(stepPreviewZoom(1.1, -1)).toBe(PREVIEW_ZOOM_DEFAULT);
    });

    it("resolves preview zoom render debounce from settings", () => {
        expect(resolvePreviewZoomRenderDebounceMs(null)).toBe(
            PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS,
        );
        expect(resolvePreviewZoomRenderDebounceMs(80)).toBe(80);
        expect(resolvePreviewZoomRenderDebounceMs(-5)).toBe(0);
        expect(resolvePreviewZoomRenderDebounceMs(900)).toBe(500);
    });

    it("scales raster density with zoom", () => {
        const pageWidthPt = 595;
        const fitWidthPx = 800;
        const full = pixelPerPtForScreenLayout(fitWidthPx, pageWidthPt, 1);
        const half = pixelPerPtForScreenLayout(fitWidthPx, pageWidthPt, 0.5);
        expect(half).toBeCloseTo(full * 0.5, 5);
    });
});
