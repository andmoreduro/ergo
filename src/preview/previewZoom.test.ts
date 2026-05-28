import { describe, expect, it } from "vitest";
import { pixelPerPtForScreenLayout } from "./canvasMetrics";
import {
    PREVIEW_ZOOM_DEFAULT,
    PREVIEW_ZOOM_MAX,
    PREVIEW_ZOOM_MIN,
    PREVIEW_ZOOM_UI_BASE,
    clampPreviewZoom,
    fitPreviewZoomForPageHeight,
    fitPreviewZoomForPageWidth,
    formatPreviewZoomPercent,
    layoutZoomForManualPreviewZoom,
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
        expect(stepPreviewZoom(1, -1)).toBe(0.9);
    });

    it("shows the UI baseline as 100%", () => {
        expect(formatPreviewZoomPercent(PREVIEW_ZOOM_UI_BASE)).toBe(100);
        expect(formatPreviewZoomPercent(PREVIEW_ZOOM_UI_BASE * 1.1)).toBe(110);
    });

    it("makes 100% fit the largest page width with side gaps", () => {
        const pages = [
            { widthPt: 300, heightPt: 500 },
            { widthPt: 600, heightPt: 500 },
        ];

        expect(
            layoutZoomForManualPreviewZoom({
                gapPx: 24,
                manualZoom: 1,
                pages,
                viewportWidthPx: 824,
            }),
        ).toBeCloseTo(1, 5);
    });

    it("resolves dynamic fit width and fit height zoom from the target page", () => {
        const page = { widthPt: 300, heightPt: 450 };

        expect(fitPreviewZoomForPageWidth(424, page, 24)).toBeCloseTo(1, 5);
        expect(fitPreviewZoomForPageHeight(634, page, 34)).toBeCloseTo(1, 5);
    });

    it("scales raster density with zoom", () => {
        const pageWidthPt = 595;
        const full = pixelPerPtForScreenLayout(pageWidthPt, 1);
        const half = pixelPerPtForScreenLayout(pageWidthPt, 0.5);
        expect(half).toBeCloseTo(full * 0.5, 5);
    });
});
