import { describe, expect, it } from "vitest";
import { clampHeadingLevel, headingLevelOptions } from "./headingLevels";

describe("headingLevels", () => {
    it("clamps levels to 1..6", () => {
        expect(clampHeadingLevel(0)).toBe(1);
        expect(clampHeadingLevel(7)).toBe(6);
        expect(clampHeadingLevel(3)).toBe(3);
    });

    it("exposes H1..H6 options", () => {
        expect(headingLevelOptions().map((option) => option.label)).toEqual([
            "H1",
            "H2",
            "H3",
            "H4",
            "H5",
            "H6",
        ]);
    });
});
