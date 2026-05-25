import { describe, expect, it } from "vitest";
import {
    caretStyleForPageMetrics,
    previewPageDisplayWidthPx,
    syntheticCaretCue,
} from "./canvasMetrics";

describe("previewPageDisplayWidthPx", () => {
    it("scales only from the stable fit width and zoom factor", () => {
        expect(previewPageDisplayWidthPx(400, 1)).toBe(400);
        expect(previewPageDisplayWidthPx(400, 1.1)).toBeCloseTo(440);
        expect(previewPageDisplayWidthPx(400, 0.9)).toBe(360);
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
