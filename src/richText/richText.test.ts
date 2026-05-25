import { describe, expect, it } from "vitest";
import {
    createReferenceSpan,
    insertReferenceAtOffset,
    richTextPlainLength,
    richTextToPlainText,
} from "./richText";
import { createRichText } from "../state/ast/defaults";

describe("richText", () => {
    it("inserts a reference span at a plain-text offset", () => {
        const content = [createRichText("Hello world")];
        const next = insertReferenceAtOffset(content, 5, "eq-1", "Equation");

        expect(richTextToPlainText(next)).toBe("Hello world");
        expect(next.some((span) => span.reference_id === "eq-1")).toBe(true);
        expect(richTextPlainLength(next)).toBe(11);
    });

    it("appends a reference when the offset is at the end", () => {
        const content = [createRichText("Hi")];
        const next = insertReferenceAtOffset(content, 2, "ref-1", "Garcia");

        expect(next.at(-1)).toEqual(createReferenceSpan("ref-1", "Garcia"));
    });
});
