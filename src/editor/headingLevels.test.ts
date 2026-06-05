import { describe, expect, it } from "vitest";
import { clampHeadingLevel } from "./headingLevels";

describe("headingLevels", () => {
    it("clamps levels to 1..6", () => {
        expect(clampHeadingLevel(0)).toBe(1);
        expect(clampHeadingLevel(7)).toBe(6);
        expect(clampHeadingLevel(3)).toBe(3);
    });
});
