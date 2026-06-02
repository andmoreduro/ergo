import { describe, expect, it } from "vitest";
import {
    filterReferenceItems,
    matchesReferenceSearch,
} from "./insertReferenceSearch";

describe("insertReferenceSearch", () => {
    it("matches label and subtitle case-insensitively", () => {
        expect(matchesReferenceSearch("fig", "Figure 1", "Resources")).toBe(true);
        expect(matchesReferenceSearch("resources", "Figure 1", "Resources")).toBe(
            true,
        );
        expect(matchesReferenceSearch("missing", "Figure 1", "Resources")).toBe(
            false,
        );
    });

    it("returns all items when the query is blank", () => {
        const items = [
            { label: "A", subtitle: "x" },
            { label: "B" },
        ];
        expect(filterReferenceItems(items, "   ")).toEqual(items);
    });
});
