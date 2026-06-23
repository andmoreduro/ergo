import { describe, expect, it } from "vitest";
import { previewPageDisplayWidthPx } from "./previewPageMetrics";

describe("previewPageDisplayWidthPx", () => {
    it("scales from Typst page width and zoom, not the preview pane width", () => {
        const pageWidthPt = 612;
        expect(previewPageDisplayWidthPx(pageWidthPt, 1)).toBe(816);
        expect(previewPageDisplayWidthPx(pageWidthPt, 1.1)).toBeCloseTo(816 * 1.1);
        expect(previewPageDisplayWidthPx(pageWidthPt, 0.9)).toBeCloseTo(816 * 0.9);
    });
});
