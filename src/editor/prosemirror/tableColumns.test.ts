import { describe, expect, it } from "vitest";
import { cellColwidth, columnPixelWidths } from "./tableColumns";

describe("tableColumns", () => {
    it("splits fr units into stable pixel widths", () => {
        const widths = columnPixelWidths(2, ["1fr", "1fr"]);
        expect(widths).toEqual([5000, 5000]);
    });

    it("builds colwidth arrays for cells", () => {
        const widths = columnPixelWidths(2, ["1fr", "2fr"]);
        expect(cellColwidth(0, 1, widths)).toEqual([3333]);
        expect(cellColwidth(1, 1, widths)).toEqual([6667]);
    });
});
