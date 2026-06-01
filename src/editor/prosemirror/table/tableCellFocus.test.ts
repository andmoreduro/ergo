import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { createRichText } from "../../../state/ast/defaults";
import { tableSchema } from "./tableSchema";
import { tableToSubDoc } from "./tableSubBridge";
import {
    parseTableCellFieldId,
    selectionInChildTableForFocus,
    tableCellCoordsFromChildState,
} from "./tableCellFocus";

describe("tableCellFocus", () => {
    it("parses table cell field ids", () => {
        expect(parseTableCellFieldId("t1:cell:2:3", "t1")).toEqual({
            row: 2,
            col: 3,
        });
        expect(parseTableCellFieldId("t1:text", "t1")).toBeNull();
    });

    it("maps child selection to cell coordinates and back to caret position", () => {
        const table = {
            type: "Table" as const,
            id: "t1",
            rows: 1,
            cols: 2,
            cells: [
                [
                    {
                        content: [
                            createRichText("ab"),
                            {
                                ...createRichText("@ref"),
                                kind: "reference",
                                reference_id: "r1",
                            },
                            createRichText("cd"),
                        ],
                        row_span: null,
                        col_span: null,
                    },
                    { content: [createRichText("xy")], row_span: null, col_span: null },
                ],
            ],
            column_sizes: ["1fr", "1fr"],
            extra_fields: {},
        };
        const doc = tableToSubDoc(tableSchema, table);
        const state = EditorState.create({
            doc,
            selection: selectionInChildTableForFocus(doc, {
                elementId: "t1",
                fieldId: "t1:cell:0:0",
                caretUtf16Offset: 4,
            })!,
        });
        const coords = tableCellCoordsFromChildState(state);
        expect(coords?.row).toBe(0);
        expect(coords?.col).toBe(0);
        expect(coords?.caretUtf16Offset).toBe(4);
    });
});
