import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import type { ContentSection } from "../../bindings/ContentSection";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { RichText } from "../../bindings/RichText";
import { createRichText, createTable } from "../../state/ast/defaults";
import { bodySchema } from "./schema";
import {
    changedTopLevelRange,
    docToElements,
    elementToNode,
    fieldCaretOffsetFromNode,
    fragmentToRichText,
    nodeToElement,
    pmPosForFieldCaret,
    richTextFieldLength,
    richTextToInlineNodes,
    sectionToDoc,
} from "./astBridge";

const reference = (label: string, id: string): RichText => ({
    ...createRichText(label),
    kind: "reference",
    reference_id: id,
});

const inlineEquation = (label: string, source: string): RichText => ({
    ...createRichText(label),
    kind: "inlineEquation",
    equation_source: source,
    equation_syntax: "typst",
});

const paragraphField = (content: RichText[]) =>
    bodySchema.nodes.paragraph.create(
        { elementId: "p1" },
        richTextToInlineNodes(bodySchema, content),
    );

describe("richTextFieldLength", () => {
    it("counts text as UTF-16 code units, references as 0, equations by source", () => {
        const content = [
            createRichText("ab"),
            reference("Doe2020", "r1"),
            inlineEquation("α", "\\alpha"),
            createRichText("cd"),
        ];
        // "ab"=2 + ref=0 + "\\alpha"=6 + "cd"=2
        expect(richTextFieldLength(content)).toBe(10);
    });

    it("counts astral characters as 2 UTF-16 units", () => {
        expect(richTextFieldLength([createRichText("𝕏y")])).toBe(3);
    });
});

describe("RichText ↔ PM fragment round-trip", () => {
    const roundTrip = (content: RichText[]) =>
        fragmentToRichText(
            paragraphField(content).content,
        );

    it("preserves plain text", () => {
        const content = [createRichText("hello world")];
        expect(roundTrip(content)).toEqual(content);
    });

    it("preserves marks and merges adjacent same-mark text", () => {
        const content = [
            { ...createRichText("bold"), bold: true },
            { ...createRichText("plain") },
        ];
        expect(roundTrip(content)).toEqual(content);
    });

    it("preserves reference spans (zero width)", () => {
        const content = [
            createRichText("see "),
            reference("Doe2020", "ref-1"),
            createRichText(" now"),
        ];
        expect(roundTrip(content)).toEqual(content);
    });

    it("preserves inline equation spans (source retained)", () => {
        const content = [
            createRichText("let "),
            inlineEquation("α", "\\alpha"),
            createRichText(" hold"),
        ];
        expect(roundTrip(content)).toEqual(content);
    });
});

describe("field caret offset ↔ PM position", () => {
    it("treats a reference as zero width", () => {
        const node = paragraphField([
            createRichText("ab"),
            reference("Doe2020", "r1"),
            createRichText("cd"),
        ]);
        // PM positions: 0 a b(2) ref(3) c d(5)
        expect(fieldCaretOffsetFromNode(node, 0)).toBe(0);
        expect(fieldCaretOffsetFromNode(node, 2)).toBe(2); // before ref
        expect(fieldCaretOffsetFromNode(node, 3)).toBe(2); // after ref (0 width)
        expect(fieldCaretOffsetFromNode(node, 4)).toBe(3); // 1 into "cd"
        expect(fieldCaretOffsetFromNode(node, 5)).toBe(4); // end
    });

    it("treats an inline equation as its source width", () => {
        const node = paragraphField([
            createRichText("x"),
            inlineEquation("α", "\\alpha"), // source width 6
            createRichText("y"),
        ]);
        // PM positions: 0 x(1) eq(2) y(3)
        expect(fieldCaretOffsetFromNode(node, 1)).toBe(1); // before eq
        expect(fieldCaretOffsetFromNode(node, 2)).toBe(7); // after eq (1 + 6)
        expect(fieldCaretOffsetFromNode(node, 3)).toBe(8); // end
    });

    it("inverts back to the originating PM position at atom boundaries", () => {
        const node = paragraphField([
            createRichText("x"),
            inlineEquation("α", "\\alpha"),
            createRichText("y"),
        ]);
        expect(pmPosForFieldCaret(node, 1)).toBe(1); // before eq
        expect(pmPosForFieldCaret(node, 7)).toBe(2); // after eq
        expect(pmPosForFieldCaret(node, 8)).toBe(3); // end
    });

    it("round-trips every PM position through field offset and back", () => {
        const node = paragraphField([
            createRichText("ab"),
            reference("Doe2020", "r1"),
            createRichText("cd"),
        ]);
        for (let pos = 0; pos <= node.content.size; pos += 1) {
            const offset = fieldCaretOffsetFromNode(node, pos);
            const back = fieldCaretOffsetFromNode(
                node,
                pmPosForFieldCaret(node, offset),
            );
            expect(back).toBe(offset);
        }
    });

    it("matches richTextFieldLength at end of field", () => {
        const content = [
            createRichText("ab"),
            reference("Doe2020", "r1"),
            inlineEquation("α", "\\alpha"),
            createRichText("cd"),
        ];
        const node = paragraphField(content);
        expect(fieldCaretOffsetFromNode(node, node.content.size)).toBe(
            richTextFieldLength(content),
        );
    });

    it("handles astral characters as 2 UTF-16 units", () => {
        const node = paragraphField([createRichText("𝕏y")]);
        // "𝕏" is a surrogate pair (2 code units), "y" is 1 → size 3
        expect(fieldCaretOffsetFromNode(node, 2)).toBe(2); // after 𝕏
        expect(fieldCaretOffsetFromNode(node, 3)).toBe(3); // after y
    });
});

describe("DocumentElement ↔ PM node round-trip", () => {
    const roundTrip = (element: Parameters<typeof elementToNode>[1]) =>
        nodeToElement(elementToNode(bodySchema, element));

    it("round-trips a paragraph", () => {
        const element = {
            type: "Paragraph" as const,
            id: "p1",
            content: [createRichText("hello")],
        };
        expect(roundTrip(element)).toEqual(element);
    });

    it("round-trips a heading with level", () => {
        const element = {
            type: "Heading" as const,
            id: "h1",
            level: 3,
            content: [createRichText("Title")],
        };
        expect(roundTrip(element)).toEqual(element);
    });

    it("round-trips a quote", () => {
        const element = {
            type: "Quote" as const,
            id: "q1",
            content: [createRichText("quoted")],
        };
        expect(roundTrip(element)).toEqual(element);
    });

    it("round-trips a list and an enumeration", () => {
        const list = {
            type: "List" as const,
            id: "l1",
            items: [[createRichText("one")], [createRichText("two")]],
        };
        const enumeration = {
            type: "Enumeration" as const,
            id: "e1",
            items: [[createRichText("first")]],
        };
        expect(roundTrip(list)).toEqual(list);
        expect(roundTrip(enumeration)).toEqual(enumeration);
    });

    it("round-trips a table", () => {
        const table = createTable(2, 2, "t1");
        expect(roundTrip(table)).toEqual(table);
    });

    it("round-trips colspan and rowspan on a table cell", () => {
        const table = createTable(2, 2, "t1");
        if (table.type === "Table") {
            table.cells[0][0] = {
                content: "wide",
                col_span: 2,
                row_span: null,
            };
        }
        const back = roundTrip(table);
        expect(back.type === "Table" ? back.cells[0][0] : null).toEqual(
            table.type === "Table" ? table.cells[0][0] : null,
        );
    });

    it("round-trips atom block elements verbatim", () => {
        const equation = {
            type: "Equation" as const,
            id: "eq1",
            latex_source: "x^2",
            is_block: true,
            syntax: "latex" as const,
        };
        expect(roundTrip(equation)).toEqual(equation);
    });
});

describe("ContentSection ↔ PM document round-trip", () => {
    it("round-trips a mixed section", () => {
        const section = {
            id: "s1",
            is_optional: false,
            elements: [
                {
                    type: "Heading" as const,
                    id: "h1",
                    level: 1,
                    content: [createRichText("Intro")],
                },
                {
                    type: "Paragraph" as const,
                    id: "p1",
                    content: [createRichText("Body text")],
                },
                {
                    type: "List" as const,
                    id: "l1",
                    items: [[createRichText("item")]],
                },
            ],
        };
        const doc = sectionToDoc(bodySchema, section);
        expect(docToElements(doc)).toEqual(section.elements);
    });

    it("produces a placeholder paragraph for an empty section", () => {
        const doc = sectionToDoc(bodySchema, {
            id: "s1",
            is_optional: false,
            elements: [],
        });
        expect(doc.childCount).toBe(1);
        expect(doc.child(0).type.name).toBe("paragraph");
    });
});

describe("changedTopLevelRange", () => {
    const para = (id: string, text: string): DocumentElement => ({
        type: "Paragraph",
        id,
        content: [createRichText(text)],
    });

    const threeParagraphState = () => {
        const section = {
            id: "s1",
            is_optional: false,
            elements: [para("a", "AAA"), para("b", "BBB"), para("c", "CCC")],
        } as unknown as ContentSection;
        const doc = sectionToDoc(bodySchema, section);
        return EditorState.create({ doc });
    };

    const contentStartOf = (state: EditorState, index: number): number => {
        let pos = 0;
        for (let i = 0; i < index; i += 1) {
            pos += state.doc.child(i).nodeSize;
        }
        return pos + 1; // inside the block's content
    };

    it("reports the single block an in-place edit touched", () => {
        const state = threeParagraphState();
        const tr = state.tr.insertText("x", contentStartOf(state, 1) + 1);
        expect(changedTopLevelRange(tr)).toEqual([1, 1]);
    });

    it("reports the first block when edited at the front", () => {
        const state = threeParagraphState();
        const tr = state.tr.insertText("x", contentStartOf(state, 0) + 1);
        expect(changedTopLevelRange(tr)).toEqual([0, 0]);
    });

    it("returns null for multi-step transactions (caller re-derives all)", () => {
        const state = threeParagraphState();
        const tr = state.tr
            .insertText("x", contentStartOf(state, 2) + 1)
            .insertText("y", contentStartOf(state, 0) + 1);
        expect(tr.steps.length).toBeGreaterThan(1);
        expect(changedTopLevelRange(tr)).toBeNull();
    });
});
