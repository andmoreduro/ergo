import { describe, expect, it } from "vitest";
import {
    closestChangedPageNumber,
    previewAnchorPageFromScroll,
} from "./previewScroll";

describe("closestChangedPageNumber", () => {
    it("returns the smallest page when there is no anchor", () => {
        expect(closestChangedPageNumber([3, 1, 7], null)).toBe(1);
    });

    it("returns the changed page nearest the anchor", () => {
        expect(closestChangedPageNumber([1, 5, 9], 4)).toBe(5);
        expect(closestChangedPageNumber([1, 5, 9], 8)).toBe(9);
        expect(closestChangedPageNumber([1, 5, 9], 6)).toBe(5);
    });

    it("returns null when no pages changed", () => {
        expect(closestChangedPageNumber([], 2)).toBeNull();
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
