import { describe, expect, it } from "vitest";
import {
    applyAstActions,
    ensureMinimumContentParagraphAction,
    planContentElementRemoval,
} from "./contentFocus";
import {
    createContentSection,
    createDefaultDocumentAST,
    createHeading,
    createParagraph,
} from "../state/ast/defaults";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";

const astWithContent = (elements: DocumentElement[]): DocumentAST => ({
    ...createDefaultDocumentAST(),
    sections: [
        {
            type: "Content",
            ...createContentSection("content-1"),
            elements,
        },
    ],
});

describe("contentFocus", () => {
    it("adds a paragraph when the content section has none", () => {
        const ast = astWithContent([createHeading(2, "Intro", "h1")]);
        const action = ensureMinimumContentParagraphAction(ast);
        expect(action?.type).toBe("ADD_PARAGRAPH");

        const next = applyAstActions(ast, action ? [action] : []);
        const section = next.sections[0];
        expect(section.type === "Content").toBe(true);
        if (section.type === "Content") {
            expect(section.elements.some((element) => element.type === "Paragraph")).toBe(
                true,
            );
        }
    });

    it("focuses the previous element after deletion", () => {
        const p1 = createParagraph("One", "p1");
        const p2 = createParagraph("Two", "p2");
        const plan = planContentElementRemoval(astWithContent([p1, p2]), "p2");
        expect(plan?.focus.elementId).toBe("p1");
        expect(plan?.actions).toHaveLength(1);
    });

    it("focuses the next element when deleting the first block", () => {
        const plan = planContentElementRemoval(
            astWithContent([
                createHeading(2, "Intro", "h1"),
                createParagraph("Body", "p1"),
            ]),
            "h1",
        );
        expect(plan?.focus.elementId).toBe("p1");
    });

    it("inserts and focuses a paragraph when the last block is removed", () => {
        const only = createParagraph("", "p1");
        const plan = planContentElementRemoval(astWithContent([only]), "p1");
        expect(plan?.actions).toHaveLength(2);
        expect(plan?.actions[1]?.type).toBe("ADD_PARAGRAPH");

        const next = applyAstActions(astWithContent([only]), plan?.actions ?? []);
        const section = next.sections[0];
        expect(section.type === "Content" && section.elements).toHaveLength(1);
        if (section.type === "Content") {
            expect(section.elements[0]?.type).toBe("Paragraph");
            expect(plan?.focus.elementId).toBe(section.elements[0]?.id);
        }
    });
});
