import { describe, expect, it } from "vitest";
import { createParagraph, createRichText } from "../../../state/ast/defaults";
import { tableCellElementsEqual } from "./tableCellElements";
import type { TableElement } from "./tableSubBridge";
import { subDocToTable, tableToSubDoc } from "./tableSubBridge";

const tableEqual = (left: TableElement, right: TableElement): boolean =>
    left.id === right.id &&
    left.rows === right.rows &&
    left.cols === right.cols &&
    JSON.stringify(left.column_sizes) === JSON.stringify(right.column_sizes) &&
    JSON.stringify(left.extra_fields) === JSON.stringify(right.extra_fields) &&
    left.cells.length === right.cells.length &&
    left.cells.every((row, rowIndex) =>
        row.every((cell, colIndex) => {
            const other = right.cells[rowIndex][colIndex];
            return (
                tableCellElementsEqual(cell.elements, other.elements) &&
                cell.col_span === other.col_span &&
                cell.row_span === other.row_span
            );
        }),
    );

describe("tableSubBridge", () => {
    it("round-trips table structure, metadata, and rich cell content", () => {
        const table: TableElement = {
            type: "Table",
            id: "table-1",
            rows: 2,
            cols: 2,
            cells: [
                [
                    {
                        elements: [
                            {
                                type: "Paragraph",
                                id: "cell-p-1",
                                content: [
                                    { ...createRichText("bold "), bold: true },
                                    createRichText("plain"),
                                ],
                            },
                        ],
                        row_span: null,
                        col_span: 2,
                    },
                ],
                [
                    {
                        elements: [
                            {
                                type: "Paragraph",
                                id: "cell-p-2",
                                content: [
                                    createRichText("see "),
                                    {
                                        ...createRichText("Smith2020"),
                                        kind: "reference",
                                        reference_id: "ref-1",
                                    },
                                ],
                            },
                        ],
                        row_span: null,
                        col_span: null,
                    },
                    {
                        elements: [createParagraph()],
                        row_span: null,
                        col_span: null,
                    },
                ],
            ],
            column_sizes: ["1fr", "2fr"],
            extra_fields: { placement: "here", width: "auto" },
        };

        const doc = tableToSubDoc(undefined, table);
        const back = subDocToTable(doc, table);
        expect(tableEqual(table, back)).toBe(true);
        expect(back.cols).toBe(2);
        expect(back.column_sizes).toEqual(["1fr", "2fr"]);
        expect(back.extra_fields).toEqual({ placement: "here", width: "auto" });
    });
});
