import { describe, expect, it } from "vitest";
import { focusScrollIdentity, previewAnchorPageFromScroll } from "./previewScroll";

describe("focusScrollIdentity", () => {
    it("ignores caret offset so typing does not retrigger auto-scroll", () => {
        const base = focusScrollIdentity(4, "heading-1", "heading-1:text");
        expect(base).toBe(focusScrollIdentity(4, "heading-1", "heading-1:text"));
        expect(base).not.toBe(
            focusScrollIdentity(4, "heading-1", "heading-1:other"),
        );
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
