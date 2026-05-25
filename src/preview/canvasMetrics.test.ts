import { describe, expect, it } from "vitest";
import {
    caretStyleForPageMetrics,
    previewPageDisplayWidthPx,
    resolvePreviewPageMetrics,
    syntheticCaretCue,
} from "./canvasMetrics";

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
    it("reads metrics from canvas dataset", () => {
        const canvas = document.createElement("canvas");
        canvas.dataset.pageWidthPt = "400";
        canvas.dataset.pageHeightPt = "500";
        canvas.dataset.pixelPerPt = "2";

        expect(resolvePreviewPageMetrics(null, canvas)).toEqual({
            widthPt: 400,
            heightPt: 500,
            pixelPerPt: 2,
        });
    });

    it("falls back to letter size when no canvas metrics exist", () => {
        expect(resolvePreviewPageMetrics(null, null)).toEqual({
            widthPt: 612,
            heightPt: 792,
        });
    });
});

describe("caretStyleForPageMetrics", () => {
    const metrics = { widthPt: 612, heightPt: 792 };

    it("avoids centering transform near the left edge", () => {
        const style = caretStyleForPageMetrics(
            { xPt: 6, caretCue: { topYPt: 20, heightPt: 12 } },
            metrics,
        );
        expect(style.left).toBe("0");
        expect(style.transform).toBeUndefined();
    });

    it("centers the caret horizontally away from the edge", () => {
        const style = caretStyleForPageMetrics(
            { xPt: 200, caretCue: { topYPt: 20, heightPt: 12 } },
            metrics,
        );
        expect(style.transform).toBe("translateX(-50%)");
        expect(style.left).not.toBe("0");
    });
});
