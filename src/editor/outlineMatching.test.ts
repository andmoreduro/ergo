import { describe, expect, it } from "vitest";
import {
    buildTargetedOutlineEntries,
    collectHeadingTargets,
    headingMatchesOutline,
    GENERATED_EMPTY_HEADING_TEXT,
} from "./outlineMatching";
import type { DocumentElement } from "../bindings/DocumentElement";

const heading = (id: string, level: number, text: string): DocumentElement => ({
    type: "Heading",
    id,
    level,
    content: [{ text, source_map: null }],
});

describe("headingMatchesOutline", () => {
    it("matches identical text", () => {
        expect(headingMatchesOutline("Introduction", "Introduction")).toBe(true);
    });

    it("matches empty editor heading to generated placeholder", () => {
        expect(headingMatchesOutline("", GENERATED_EMPTY_HEADING_TEXT)).toBe(true);
    });
});

describe("buildTargetedOutlineEntries", () => {
    it("includes bibliography and placeholder headings without AST twins", () => {
        const entries = buildTargetedOutlineEntries({
            outline: {
                entries: [
                    { level: 1, text: GENERATED_EMPTY_HEADING_TEXT, page: 1 },
                    { level: 1, text: "References", page: 3 },
                ],
            },
            headingTargets: collectHeadingTargets([
                {
                    type: "Content",
                    elements: [heading("h1", 1, "")],
                },
            ]),
            isAbstractEntry: () => false,
            abstractTarget: { elementId: "inputs", fieldId: "inputs/abstract_text" },
        });

        expect(entries).toHaveLength(2);
        expect(entries[0].target?.elementId).toBe("h1");
        expect(entries[1].text).toBe("References");
        expect(entries[1].target).toBeNull();
    });
});
