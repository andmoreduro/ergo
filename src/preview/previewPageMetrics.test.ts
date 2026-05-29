import { describe, expect, it } from "vitest";
import {
    caretStyleForPageMetrics,
    pixelPerPtForContainerFit,
    previewPageDisplayWidthPx,
    resolvePreviewPageMetrics,
    syntheticCaretCue,
} from "./previewPageMetrics";

describe("pixelPerPtForContainerFit", () => {
    it("scales down when content is taller than the preview max height", () => {
        const widthOnly = pixelPerPtForContainerFit(200, 400, { widthPx: 100 }, 1);
        const contained = pixelPerPtForContainerFit(
            200,
            400,
            { widthPx: 100, heightPx: 120 },
            1,
        );

        expect(contained).toBeLessThan(widthOnly);
    });
});

describe("previewPageDisplayWidthPx", () => {
    it("scales from Typst page width and zoom, not the preview pane width", () => {
        const pageWidthPt = 612;
        expect(previewPageDisplayWidthPx(pageWidthPt, 1)).toBe(816);
        expect(previewPageDisplayWidthPx(pageWidthPt, 1.1)).toBeCloseTo(816 * 1.1);
        expect(previewPageDisplayWidthPx(pageWidthPt, 0.9)).toBeCloseTo(816 * 0.9);
    });
});

describe("syntheticCaretCue", () => {
    it("builds a cue from yPt when the backend omits caretCue", () => {
        expect(syntheticCaretCue({ yPt: 40, caretCue: null })).toEqual({
            topYPt: 34,
            heightPt: 12,
        });
    });

    it("preserves an existing caretCue", () => {
        const cue = { topYPt: 10, heightPt: 14 };
        expect(syntheticCaretCue({ yPt: 40, caretCue: cue })).toBe(cue);
    });
});

describe("resolvePreviewPageMetrics", () => {
    it("reads metrics from the page content dataset", () => {
        const pageContent = document.createElement("div");
        pageContent.dataset.pageWidthPt = "400";
        pageContent.dataset.pageHeightPt = "500";
        pageContent.dataset.pixelPerPt = "2";

        expect(resolvePreviewPageMetrics(pageContent)).toEqual({
            widthPt: 400,
            heightPt: 500,
            pixelPerPt: 2,
        });
    });

    it("falls back to letter size when no page metrics exist", () => {
        expect(resolvePreviewPageMetrics(null)).toEqual({
            widthPt: 612,
            heightPt: 792,
        });
    });
});

describe("caretStyleForPageMetrics", () => {
    const metrics = { widthPt: 612, heightPt: 792 };

    it("centers the dot on the caret cue midpoint", () => {
        const style = caretStyleForPageMetrics(
            { xPt: 6, caretCue: { topYPt: 20, heightPt: 12 } },
            metrics,
        );
        expect(style.left).toBe("0.98%");
        expect(style.top).toBe("3.28%");
        expect(style.transform).toBe("translate(-50%, -50%)");
    });

    it("centers the dot away from the left edge", () => {
        const style = caretStyleForPageMetrics(
            { xPt: 200, caretCue: { topYPt: 20, heightPt: 12 } },
            metrics,
        );
        expect(style.transform).toBe("translate(-50%, -50%)");
        expect(style.left).toBe("32.68%");
    });
});
