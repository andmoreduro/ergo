import { describe, expect, it } from "vitest";
import { createParagraph, createRichText } from "../../../state/ast/defaults";
import type { TableElement } from "./tableSubBridge";
import { subDocToTable, tableToSubDoc } from "./tableSubBridge";

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
                        elements: [createParagraph("", "cell-p-3")],
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
        expect(back).toEqual(table);
    });
});
