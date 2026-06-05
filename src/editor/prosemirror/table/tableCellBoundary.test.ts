import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { createParagraph, createRichText } from "../../../state/ast/defaults";
import { richTextFieldId } from "../../fieldIds";
import { tableSchema } from "./tableSchema";
import { tableToSubDoc } from "./tableSubBridge";
import {
    handleTableCellBoundaryArrow,
    isTableCellAtOuterEdge,
    shouldSwallowCellBoundaryArrow,
} from "./tableCellBoundary";
import { selectionInChildTableForFocus } from "./tableCellFocus";

const singleCellTable = {
    type: "Table" as const,
    id: "t1",
    rows: 1,
    cols: 1,
    cells: [
        [
            {
                elements: [
                    {
                        type: "Paragraph" as const,
                        id: "cell-p",
                        content: [createRichText("hi")],
                    },
                ],
                row_span: null,
                col_span: null,
            },
        ],
    ],
    column_sizes: ["1fr"],
    extra_fields: {},
};

describe("tableCellBoundary", () => {
    it("detects the top row as the outer edge", () => {
        const doc = tableToSubDoc(tableSchema, singleCellTable);
        const selection = selectionInChildTableForFocus(doc, {
            elementId: "t1",
            fieldId: richTextFieldId("cell-p"),
            caretUtf16Offset: 0,
        });
        const state = EditorState.create({ doc, selection: selection! });
        expect(isTableCellAtOuterEdge(state, "up")).toBe(true);
        expect(isTableCellAtOuterEdge(state, "left")).toBe(true);
        expect(shouldSwallowCellBoundaryArrow(state, "up")).toBe(true);
    });

    it("does not swallow up on the top row when another block sits above in the cell", () => {
        const table = {
            type: "Table" as const,
            id: "t1",
            rows: 1,
            cols: 1,
            cells: [
                [
                    {
                        elements: [
                            createParagraph("", "p1"),
                            createParagraph("second", "p2"),
                        ],
                        row_span: null,
                        col_span: null,
                    },
                ],
            ],
            column_sizes: ["1fr"],
            extra_fields: {},
        };
        const doc = tableToSubDoc(tableSchema, table);
        const selection = selectionInChildTableForFocus(doc, {
            elementId: "t1",
            fieldId: richTextFieldId("p2"),
            caretUtf16Offset: 0,
        });
        const state = EditorState.create({ doc, selection: selection! });
        expect(isTableCellAtOuterEdge(state, "up")).toBe(true);
        expect(shouldSwallowCellBoundaryArrow(state, "up")).toBe(false);
    });

    it("swallows Ctrl+Up on the top row when the caret cannot leave the cell", () => {
        const doc = tableToSubDoc(tableSchema, singleCellTable);
        const selection = selectionInChildTableForFocus(doc, {
            elementId: "t1",
            fieldId: richTextFieldId("cell-p"),
            caretUtf16Offset: 0,
        });
        const state = EditorState.create({ doc, selection: selection! });
        const view = {
            state,
            endOfTextblock: () => true,
            dispatch: () => {},
        } as unknown as import("prosemirror-view").EditorView;
        expect(
            handleTableCellBoundaryArrow(view, {
                key: "ArrowUp",
                altKey: false,
                ctrlKey: true,
                metaKey: false,
                shiftKey: false,
            }),
        ).toBe(true);
    });
});
