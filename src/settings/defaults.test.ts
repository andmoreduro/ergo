import { describe, expect, it } from "vitest";

import { mergeRecentProjectLists } from "./defaults";

describe("mergeRecentProjectLists", () => {
    it("prefers primary order and deduplicates", () => {
        expect(
            mergeRecentProjectLists(
                ["/b.ergproj", "/a.ergproj"],
                ["/a.ergproj", "/c.ergproj"],
            ),
        ).toEqual(["/b.ergproj", "/a.ergproj", "/c.ergproj"]);
    });

    it("caps at eight entries", () => {
        const primary = Array.from({ length: 5 }, (_, index) => `/p${index}.ergproj`);
        const secondary = Array.from({ length: 5 }, (_, index) => `/s${index}.ergproj`);
        expect(mergeRecentProjectLists(primary, secondary)).toHaveLength(8);
    });
});
