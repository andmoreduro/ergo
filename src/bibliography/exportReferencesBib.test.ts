import { describe, expect, it } from "vitest";
import { exportReferencesBib } from "./exportReferencesBib";

describe("exportReferencesBib", () => {
    it("joins non-empty biblatex blocks with blank lines", () => {
        const source = exportReferencesBib([
            {
                id: "a",
                citation_key: "a",
                biblatex: "@article{a, title = {One}}",
            },
            {
                id: "b",
                citation_key: "b",
                biblatex: "@book{b, title = {Two}}",
            },
        ]);
        expect(source).toBe(
            "@article{a, title = {One}}\n\n@book{b, title = {Two}}\n",
        );
    });

    it("skips empty entries", () => {
        expect(
            exportReferencesBib([
                {
                    id: "a",
                    citation_key: "a",
                    biblatex: "   ",
                },
            ]),
        ).toBe("");
    });
});
