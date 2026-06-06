import { describe, expect, it } from "vitest";
import {
    anchorPageFromVisibility,
    closestChangedPageNumber,
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

describe("anchorPageFromVisibility", () => {
    it("returns the page with the largest visible height", () => {
        const visibility = new Map<number, number>([
            [1, 50],
            [2, 350],
            [3, 0],
        ]);

        expect(anchorPageFromVisibility(visibility)).toBe(2);
    });

    it("returns null when no page is visible", () => {
        expect(anchorPageFromVisibility(new Map())).toBeNull();
    });
});
