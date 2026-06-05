import { describe, expect, it } from "vitest";
import { moveReferenceHighlight } from "./insertReferenceListKeyboard";

describe("moveReferenceHighlight", () => {
    it("clamps at the first and last item", () => {
        expect(moveReferenceHighlight(0, -1, 3)).toBe(0);
        expect(moveReferenceHighlight(2, 1, 3)).toBe(2);
    });

    it("moves within the list", () => {
        expect(moveReferenceHighlight(1, 1, 3)).toBe(2);
        expect(moveReferenceHighlight(1, -1, 3)).toBe(0);
    });

    it("returns zero when there are no items", () => {
        expect(moveReferenceHighlight(0, 1, 0)).toBe(0);
    });
});
