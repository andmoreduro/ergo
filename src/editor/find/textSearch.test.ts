import { describe, expect, it } from "vitest";
import { findAllMatches, nextMatchIndex } from "./textSearch";

describe("textSearch", () => {
    it("finds all case-insensitive matches", () => {
        expect(findAllMatches("Hello hello", "ell")).toEqual([
            { start: 1, end: 4 },
            { start: 7, end: 10 },
        ]);
    });

    it("wraps forward search when no later match exists", () => {
        const matches = findAllMatches("aba", "a");
        expect(nextMatchIndex(matches, 0, 1)).toBe(0);
        expect(nextMatchIndex(matches, 3, 1)).toBe(0);
        expect(nextMatchIndex(matches, 1, -1)).toBe(0);
    });
});
