import { describe, expect, it } from "vitest";
import { createParagraph, createQuote, createRichText } from "../../../state/ast/defaults";
import type { TableCell } from "../../../bindings/TableCell";
import { buildInsertInTableCellAction } from "./tableCellInsert";
import { richTextFieldId } from "../../fieldIds";

const tableCtx = (cell: TableCell) => ({
    table: {
        type: "Table" as const,
        id: "t1",
        rows: 1,
        cols: 1,
        cells: [[cell]],
        column_sizes: ["1fr"],
        extra_fields: {},
    },
    row: 0,
    col: 0,
    tableId: "t1",
});

describe("buildInsertInTableCellAction", () => {
    it("replaces an empty paragraph with a quote", () => {
        const paragraph = createParagraph("", "p1");
        const action = buildInsertInTableCellAction(
            tableCtx({
                elements: [paragraph],
                row_span: null,
                col_span: null,
            }),
            createQuote("", "q1"),
            { elementId: "t1", fieldId: richTextFieldId("p1") },
        );
        expect(action.payload.elements).toHaveLength(1);
        expect(action.payload.elements[0]?.type).toBe("Quote");
    });

    it("appends after a block equation instead of replacing it", () => {
        const action = buildInsertInTableCellAction(
            tableCtx({
                elements: [
                    {
                        type: "Equation",
                        id: "eq1",
                        latex_source: "x",
                        is_block: true,
                        syntax: "typst",
                    },
                    createParagraph("", "p1"),
                ],
                row_span: null,
                col_span: null,
            }),
            createParagraph("", "p2"),
            { elementId: "eq1", fieldId: "eq1:latexSource" },
        );
        expect(action.payload.elements).toHaveLength(3);
        expect(action.payload.elements[0]?.type).toBe("Equation");
        expect(action.payload.elements[2]?.type).toBe("Paragraph");
    });

    it("appends when the focused block is not empty", () => {
        const paragraph = createParagraph("hello", "p1");
        const action = buildInsertInTableCellAction(
            tableCtx({
                elements: [paragraph],
                row_span: null,
                col_span: null,
            }),
            createQuote("", "q1"),
            { elementId: "t1", fieldId: richTextFieldId("p1") },
        );
        expect(action.payload.elements).toHaveLength(2);
    });
});
