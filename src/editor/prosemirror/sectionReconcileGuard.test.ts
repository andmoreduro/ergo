import { describe, expect, it } from "vitest";
import { createRichText } from "../../state/ast/defaults";
import type { DocumentElement } from "../../bindings/DocumentElement";
import {
    paragraphHasUnderline,
    pmFormattingAheadOfSection,
} from "./sectionReconcileGuard";

const para = (id: string, content: ReturnType<typeof createRichText>[]) =>
    ({
        type: "Paragraph",
        id,
        content,
    }) as DocumentElement;

describe("sectionReconcileGuard", () => {
    it("detects underline ahead in PM", () => {
        const pm = [para("p1", [{ ...createRichText("x"), underline: true }])];
        const section = [para("p1", [createRichText("x")])];
        expect(pmFormattingAheadOfSection(pm, section)).toBe(true);
        expect(paragraphHasUnderline(pm)).toBe(true);
        expect(paragraphHasUnderline(section)).toBe(false);
    });

    it("does not treat undo-shaped drift as ahead when ids diverge", () => {
        const pm = [para("p1", [{ ...createRichText("x"), underline: true }])];
        const section = [para("p2", [createRichText("x")])];
        expect(pmFormattingAheadOfSection(pm, section)).toBe(false);
    });
});
