import { describe, expect, it } from "vitest";
import {
    caretStyleForPageMetrics,
    previewPageDisplayWidthPx,
    resolvePreviewPageMetrics,
    syntheticCaretCue,
} from "./previewPageMetrics";

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

describe("caretStyleForPageMetrics", () => {
    const metrics = { widthPt: 612, heightPt: 792 };

    it("positions the caret dot in page coordinates", () => {
        expect(
            caretStyleForPageMetrics(
                { xPt: 6, caretCue: { topYPt: 20, heightPt: 12 } },
                metrics,
            ),
        ).toEqual({
            left: "0.98%",
            top: "3.28%",
            height: "1.52%",
            transform: "translate(-50%, -50%)",
        });

        const awayFromEdge = caretStyleForPageMetrics(
            { xPt: 200, caretCue: { topYPt: 20, heightPt: 12 } },
            metrics,
        );
        expect(awayFromEdge.transform).toBe("translate(-50%, -50%)");
        expect(awayFromEdge.left).toBe("32.68%");
    });
});
