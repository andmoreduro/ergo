import { describe, expect, it } from "vitest";
import {
    focusScrollIdentity,
    previewAnchorPageFromScroll,
    scrollPreviewToCaretPosition,
} from "./previewScroll";

describe("focusScrollIdentity", () => {
    it("ignores caret offset so typing does not retrigger auto-scroll", () => {
        const base = focusScrollIdentity(4, "heading-1", "heading-1:text");
        expect(base).toBe(focusScrollIdentity(4, "heading-1", "heading-1:text"));
        expect(base).not.toBe(
            focusScrollIdentity(4, "heading-1", "heading-1:other"),
        );
    });
});

describe("scrollPreviewToCaretPosition", () => {
    it("scrolls vertically and horizontally to center the caret", () => {
        const scrollRoot = document.createElement("div");
        Object.defineProperty(scrollRoot, "clientHeight", { value: 200 });
        Object.defineProperty(scrollRoot, "clientWidth", { value: 300 });
        Object.defineProperty(scrollRoot, "scrollHeight", { value: 1200 });
        Object.defineProperty(scrollRoot, "scrollWidth", { value: 900 });
        scrollRoot.scrollTop = 0;
        scrollRoot.scrollLeft = 0;

        scrollRoot.getBoundingClientRect = () =>
            ({
                top: 100,
                bottom: 300,
                left: 50,
                right: 350,
                width: 300,
                height: 200,
                x: 50,
                y: 100,
                toJSON: () => ({}),
            }) as DOMRect;

        const page = document.createElement("div");
        page.dataset.previewPageNumber = "1";

        const surface = document.createElement("div");
        surface.dataset.previewPageSurface = "true";
        surface.getBoundingClientRect = () =>
            ({
                top: 520,
                bottom: 1120,
                left: 20,
                right: 620,
                width: 600,
                height: 600,
                x: 20,
                y: 520,
                toJSON: () => ({}),
            }) as DOMRect;

        const canvas = document.createElement("canvas");
        canvas.dataset.pageWidthPt = "612";
        canvas.dataset.pageHeightPt = "792";
        canvas.dataset.pixelPerPt = "1";

        surface.appendChild(canvas);
        page.appendChild(surface);
        scrollRoot.appendChild(page);
        document.body.appendChild(scrollRoot);

        const scrolled = scrollPreviewToCaretPosition(scrollRoot, {
            pageNumber: 1,
            xPt: 306,
            caretCue: { topYPt: 396, heightPt: 12 },
        });

        expect(scrolled).toBe(true);
        expect(scrollRoot.scrollTop).toBeGreaterThan(400);
        expect(scrollRoot.scrollLeft).toBeGreaterThan(0);

        document.body.removeChild(scrollRoot);
    });

    it("scrolls horizontally for a caret on the right side of a wide page", () => {
        const scrollRoot = document.createElement("div");
        Object.defineProperty(scrollRoot, "clientHeight", { value: 400 });
        Object.defineProperty(scrollRoot, "clientWidth", { value: 320 });
        Object.defineProperty(scrollRoot, "scrollHeight", { value: 1200 });
        Object.defineProperty(scrollRoot, "scrollWidth", { value: 900 });
        scrollRoot.scrollTop = 0;
        scrollRoot.scrollLeft = 0;

        scrollRoot.getBoundingClientRect = () =>
            ({
                top: 0,
                bottom: 400,
                left: 0,
                right: 320,
                width: 320,
                height: 400,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        const page = document.createElement("div");
        page.dataset.previewPageNumber = "1";

        const surface = document.createElement("div");
        surface.dataset.previewPageSurface = "true";
        surface.getBoundingClientRect = () =>
            ({
                top: 0,
                bottom: 800,
                left: 100,
                right: 700,
                width: 600,
                height: 800,
                x: 100,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        const canvas = document.createElement("canvas");
        canvas.dataset.pageWidthPt = "612";
        canvas.dataset.pageHeightPt = "792";
        canvas.dataset.pixelPerPt = "1";

        surface.appendChild(canvas);
        page.appendChild(surface);
        scrollRoot.appendChild(page);
        document.body.appendChild(scrollRoot);

        const scrolled = scrollPreviewToCaretPosition(scrollRoot, {
            pageNumber: 1,
            xPt: 560,
            caretCue: { topYPt: 24, heightPt: 12 },
        });

        expect(scrolled).toBe(true);
        expect(scrollRoot.scrollLeft).toBeGreaterThan(0);

        document.body.removeChild(scrollRoot);
    });
});

describe("previewAnchorPageFromScroll", () => {
    it("returns the page with the largest visible area in the viewport", () => {
        const scrollRoot = document.createElement("div");
        scrollRoot.getBoundingClientRect = () =>
            ({
                top: 0,
                bottom: 400,
                left: 0,
                right: 300,
                width: 300,
                height: 400,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        const makePage = (pageNumber: number, top: number, height: number) => {
            const page = document.createElement("div");
            page.dataset.previewPageNumber = String(pageNumber);
            page.getBoundingClientRect = () =>
                ({
                    top,
                    bottom: top + height,
                    left: 0,
                    right: 300,
                    width: 300,
                    height,
                    x: 0,
                    y: top,
                    toJSON: () => ({}),
                }) as DOMRect;
            scrollRoot.appendChild(page);
        };

        makePage(1, -350, 400);
        makePage(2, 50, 400);
        makePage(3, 450, 400);
        document.body.appendChild(scrollRoot);

        expect(previewAnchorPageFromScroll(scrollRoot)).toBe(2);

        document.body.removeChild(scrollRoot);
    });
});
