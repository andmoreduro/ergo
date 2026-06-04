import { describe, expect, it } from "vitest";
import {
    previewPageDisplayWidthPx,
    resolvePreviewPageMetrics,
} from "./previewPageMetrics";

describe("previewPageDisplayWidthPx", () => {
    it("scales from Typst page width and zoom, not the preview pane width", () => {
        const pageWidthPt = 612;
        expect(previewPageDisplayWidthPx(pageWidthPt, 1)).toBe(816);
        expect(previewPageDisplayWidthPx(pageWidthPt, 1.1)).toBeCloseTo(816 * 1.1);
        expect(previewPageDisplayWidthPx(pageWidthPt, 0.9)).toBeCloseTo(816 * 0.9);
    });
});

describe("resolvePreviewPageMetrics", () => {
    it("reads metrics from the page content dataset", () => {
        const pageContent = document.createElement("div");
        pageContent.dataset.pageWidthPt = "400";
        pageContent.dataset.pageHeightPt = "500";
        pageContent.dataset.pixelPerPt = "1";

        expect(resolvePreviewPageMetrics(pageContent)).toEqual({
            widthPt: 400,
            heightPt: 500,
            pixelPerPt: 1,
        });
    });

    it("falls back to letter size when no page metrics exist", () => {
        expect(resolvePreviewPageMetrics(null)).toEqual({
            widthPt: 612,
            heightPt: 792,
        });
    });
});
