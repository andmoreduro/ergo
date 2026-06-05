import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import type { ContentSection } from "../../bindings/ContentSection";
import { createRichText } from "../../state/ast/defaults";
import type { DocumentElement } from "../../bindings/DocumentElement";
import { docToElements, sectionToDoc } from "./astBridge";
import { bodySchema } from "./schema";
import { bodyPlugins } from "./plugins";
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

    it("drops PM underline when a stale section snapshot replaces the whole doc", () => {
        const section = {
            id: "s1",
            is_optional: false,
            elements: [para("p1", [createRichText("hello")])],
        } as ContentSection;
        const doc = sectionToDoc(bodySchema, section);
        const state = EditorState.create({ doc, plugins: bodyPlugins() });
        const mark = bodySchema.marks.underline;
        const from = 1;
        const to = 1 + "hello".length;
        const withUnderline = state.apply(state.tr.addMark(from, to, mark.create()));
        expect(paragraphHasUnderline(docToElements(withUnderline.doc))).toBe(true);

        const staleTarget = sectionToDoc(bodySchema, section);
        const reconciled = withUnderline.apply(
            withUnderline.tr.replaceWith(
                0,
                withUnderline.doc.content.size,
                staleTarget,
            ),
        );
        expect(paragraphHasUnderline(docToElements(reconciled.doc))).toBe(false);
    });
});
