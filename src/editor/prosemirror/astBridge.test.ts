import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import type { ContentSection } from "../../bindings/ContentSection";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { RichText } from "../../bindings/RichText";
import { createListItem, createQuote, createRichText, createTable } from "../../state/ast/defaults";
import { bodySchema } from "./schema";
import { tableSchema } from "./table/tableSchema";
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

const inlineQuote = (text: string): RichText => ({
    ...createRichText(text),
    kind: "quote",
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
        fragmentToRichText(paragraphField(content).content);

    it("preserves rich text spans through PM round-trip", () => {
        const cases: RichText[][] = [
            [createRichText("hello world")],
            [
                { ...createRichText("bold"), bold: true },
                { ...createRichText("plain") },
            ],
            [
                { ...createRichText("under"), underline: true },
                { ...createRichText("plain") },
            ],
            [
                createRichText("see "),
                reference("Doe2020", "ref-1"),
                createRichText(" now"),
            ],
            [
                createRichText("let "),
                inlineEquation("α", "\\alpha"),
                createRichText(" hold"),
            ],
            [
                createRichText("As "),
                inlineQuote("they said"),
                createRichText(" noted"),
            ],
        ];

        for (const content of cases) {
            expect(roundTrip(content)).toEqual(content);
        }
    });

    it("collects hard breaks inside table cell paragraphs", () => {
        const cell = tableSchema.nodes.table_cell.create(null, [
            tableSchema.nodes.paragraph.create({ elementId: "cell-p" }, [
                tableSchema.text("line one"),
                tableSchema.nodes.hard_break.create(),
                tableSchema.text("line two"),
            ]),
        ]);
        const paragraph = cell.firstChild;
        expect(paragraph?.type.name).toBe("paragraph");
        const spans = fragmentToRichText(paragraph?.content ?? cell.content);
        expect(spans).toHaveLength(1);
        expect(spans[0]?.text).toContain("line one");
        expect(spans[0]?.text).toContain("line two");
    });
});

describe("field caret offset ↔ PM position", () => {
    it("maps reference and equation atoms to field caret offsets", () => {
        const referenceNode = paragraphField([
            createRichText("ab"),
            reference("Doe2020", "r1"),
            createRichText("cd"),
        ]);
        expect(fieldCaretOffsetFromNode(referenceNode, 2)).toBe(2);
        expect(fieldCaretOffsetFromNode(referenceNode, 3)).toBe(2);
        expect(fieldCaretOffsetFromNode(referenceNode, 4)).toBe(3);

        const equationNode = paragraphField([
            createRichText("x"),
            inlineEquation("α", "\\alpha"),
            createRichText("y"),
        ]);
        expect(fieldCaretOffsetFromNode(equationNode, 1)).toBe(1);
        expect(fieldCaretOffsetFromNode(equationNode, 2)).toBe(7);
        expect(fieldCaretOffsetFromNode(equationNode, 3)).toBe(8);
    });

    it("round-trips every PM position through field offset and back", () => {
        const node = paragraphField([
            createRichText("ab"),
            reference("Doe2020", "r1"),
            inlineEquation("α", "\\alpha"),
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

    it("round-trips basic block elements", () => {
        const elements = [
            {
                type: "Paragraph" as const,
                id: "p1",
                content: [createRichText("hello")],
            },
            {
                type: "Heading" as const,
                id: "h1",
                level: 3,
                content: [createRichText("Title")],
            },
            createQuote("quoted", "q1"),
        ];

        for (const element of elements) {
            expect(roundTrip(element)).toEqual(element);
        }
    });

    it("round-trips a list and an enumeration", () => {
        const list = {
            type: "List" as const,
            id: "l1",
            items: [
                createListItem("one"),
                createListItem("two"),
            ],
        };
        const enumeration = {
            type: "Enumeration" as const,
            id: "e1",
            items: [createListItem("first")],
        };
        expect(roundTrip(list)).toEqual(list);
        expect(roundTrip(enumeration)).toEqual(enumeration);
    });

    it("round-trips nested list items", () => {
        const list = {
            type: "List" as const,
            id: "l1",
            items: [
                {
                    content: [createRichText("Entry")],
                    children: [
                        {
                            content: [createRichText("Nested")],
                            children: [],
                        },
                    ],
                },
            ],
        };
        expect(roundTrip(list)).toEqual(list);
    });

    it("round-trips a table", () => {
        const table = createTable(2, 2, "t1");
        expect(roundTrip(table)).toEqual(table);
    });

    it("round-trips colspan and rowspan on a table cell", () => {
        const table = createTable(2, 2, "t1");
        if (table.type === "Table") {
            table.cells[0][0] = {
                content: [createRichText("wide")],
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
                    items: [createListItem("item")],
                },
            ],
        };
        const doc = sectionToDoc(bodySchema, section);
        expect(docToElements(doc)).toEqual(section.elements);
    });

    it("round-trips block quote attribution", () => {
        const section = {
            id: "s1",
            is_optional: false,
            elements: [
                {
                    type: "Quote" as const,
                    id: "q1",
                    content: [createRichText("quoted text")],
                    attribution_text: "(Smith, 2020, p. 4)",
                    attribution_reference_id: null,
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

    it("reports the touched top-level block for in-place edits", () => {
        const cases: Array<[number, readonly [number, number]]> = [
            [1, [1, 1]],
            [0, [0, 0]],
        ];

        for (const [index, expected] of cases) {
            const state = threeParagraphState();
            const tr = state.tr.insertText("x", contentStartOf(state, index) + 1);
            expect(changedTopLevelRange(tr)).toEqual(expected);
        }
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
