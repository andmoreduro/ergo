import { describe, expect, it } from "vitest";
import { cellColwidth, columnPixelWidths } from "./tableColumns";

describe("tableColumns", () => {
    it("splits the layout width proportionally to fr weights", () => {
        const equal = columnPixelWidths(2, ["1fr", "1fr"]);
        expect(equal[0]).toBe(equal[1]);

        const weighted = columnPixelWidths(2, ["1fr", "2fr"]);
        // A 2fr column is twice a 1fr column, within rounding slack.
        expect(Math.abs(weighted[1] - 2 * weighted[0])).toBeLessThanOrEqual(1);
        expect(weighted[0] + weighted[1]).toBeGreaterThanOrEqual(9_999);
    });

    it("treats auto and malformed sizes as unit weight and clamps tiny columns", () => {
        const auto = columnPixelWidths(2, ["auto", "not-a-size"]);
        expect(auto[0]).toBe(auto[1]);

        // 300 unit columns of a 10_000px nominal layout would fall below the
        // minimum, so every column clamps to MIN_COL_PX.
        const clamped = columnPixelWidths(300, []);
        expect(clamped.every((width) => width === Math.max(...clamped))).toBe(true);
        expect(clamped[0]).toBe(48);
    });

    it("returns no widths for a zero-column table", () => {
        expect(columnPixelWidths(0, [])).toEqual([]);
    });

    it("slices colwidth across a cell's colspan", () => {
        const widths = columnPixelWidths(3, ["1fr", "1fr", "1fr"]);
        expect(cellColwidth(1, 2, widths)).toEqual([widths[1], widths[2]]);
        expect(cellColwidth(0, 1, widths)).toEqual([widths[0]]);
        expect(cellColwidth(0, 1, [])).toBeNull();
    });
});
