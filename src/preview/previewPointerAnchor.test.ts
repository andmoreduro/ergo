import { describe, expect, it } from "vitest";
import {
    clearPreviewPointerAnchor,
    resolvePreviewZoomAnchor,
    updatePreviewPointerAnchor,
} from "./previewPointerAnchor";

const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;

const scrollRootWith = (left: number, top: number, width: number, height: number) => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () => rect(left, top, width, height);
    return element;
};

describe("previewPointerAnchor", () => {
    it("uses the last pointer position when it is inside the preview column", () => {
        clearPreviewPointerAnchor();
        const scrollRoot = scrollRootWith(100, 50, 400, 600);

        updatePreviewPointerAnchor(300, 200, true);
        expect(resolvePreviewZoomAnchor(scrollRoot, scrollRoot)).toEqual({
            x: 300,
            y: 200,
        });
    });

    it("falls back to the viewport center when the pointer is outside the preview column", () => {
        clearPreviewPointerAnchor();
        const scrollRoot = scrollRootWith(100, 50, 400, 600);

        expect(resolvePreviewZoomAnchor(scrollRoot, scrollRoot)).toEqual({
            x: 300,
            y: 350,
        });
    });

    it("keeps the pointer x with a scroll-centered y when the pointer is inside the column but outside the scroll root", () => {
        clearPreviewPointerAnchor();
        // Column is wider than the scroll root; the pointer sits in the
        // column's side gutter, beyond the scroll root's right edge.
        const scrollRoot = scrollRootWith(100, 50, 400, 600);
        const column = scrollRootWith(100, 50, 800, 600);

        updatePreviewPointerAnchor(700, 200, true);
        expect(resolvePreviewZoomAnchor(scrollRoot, column)).toEqual({
            x: 700,
            y: 350,
        });
    });
});
