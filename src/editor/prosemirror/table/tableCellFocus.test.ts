import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection } from "prosemirror-state";
import { createRichText } from "../../../state/ast/defaults";
import { tableSchema } from "./tableSchema";
import { tableToSubDoc } from "./tableSubBridge";
import { richTextFieldId } from "../../fieldIds";
import {
    defaultFirstCellFocusTarget,
    isTableEscapeSelection,
    parseTableCellFieldId,
    selectionInChildTableForFocus,
    tableCellCoordsFromChildState,
    tableCellFocusTargetFromState,
} from "./tableCellFocus";

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

describe("tableCellFocus", () => {
    it("places the caret in the first paragraph when targeting cell 0:0", () => {
        const doc = tableToSubDoc(tableSchema, singleCellTable);
        const target = defaultFirstCellFocusTarget(doc, "t1");
        expect(target.fieldId).toBe(richTextFieldId("cell-p"));
        const selection = selectionInChildTableForFocus(doc, target);
        expect(selection?.from).toBeGreaterThan(2);
    });

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
                        elements: [
                            {
                                type: "Paragraph",
                                id: "cell-p-a",
                                content: [createRichText("abcd")],
                            },
                        ],
                        row_span: null,
                        col_span: null,
                    },
                    {
                        elements: [
                            {
                                type: "Paragraph",
                                id: "cell-p-b",
                                content: [createRichText("xy")],
                            },
                        ],
                        row_span: null,
                        col_span: null,
                    },
                ],
            ],
            column_sizes: ["1fr", "1fr"],
            extra_fields: {},
        };
        const doc = tableToSubDoc(tableSchema, table);
        const initialSelection = selectionInChildTableForFocus(doc, {
            elementId: "t1",
            fieldId: richTextFieldId("cell-p-a"),
            caretUtf16Offset: 2,
        });
        expect(initialSelection).not.toBeNull();
        const state = EditorState.create({
            doc,
            selection: initialSelection!,
        });
        const coords = tableCellCoordsFromChildState(state);
        expect(coords?.row).toBe(0);
        expect(coords?.col).toBe(0);

        const target = tableCellFocusTargetFromState("t1", state);
        expect(target?.elementId).toBe("t1");
        expect(target?.fieldId).toBe(richTextFieldId("cell-p-a"));
        expect(target?.caretUtf16Offset).toBe(2);

        const roundTrip = selectionInChildTableForFocus(doc, target!);
        expect(roundTrip?.from).toBe(state.selection.from);
    });

    it("flags a whole-table NodeSelection as an escaped selection", () => {
        const doc = tableToSubDoc(tableSchema, singleCellTable);
        let tablePos = -1;
        doc.descendants((node, pos) => {
            if (tablePos < 0 && node.type.name === "table") {
                tablePos = pos;
            }
        });
        expect(tablePos).toBeGreaterThanOrEqual(0);
        const tableSelection = NodeSelection.create(doc, tablePos);
        expect(tableSelection.node.type.name).toBe("table");
        const escaped = EditorState.create({
            doc,
            selection: tableSelection,
        });
        expect(isTableEscapeSelection(escaped)).toBe(true);
    });

    it("does not flag an in-cell caret as escaped", () => {
        const doc = tableToSubDoc(tableSchema, singleCellTable);
        const inCell = selectionInChildTableForFocus(doc, {
            elementId: "t1",
            fieldId: richTextFieldId("cell-p"),
            caretUtf16Offset: 1,
        });
        expect(inCell).not.toBeNull();
        const state = EditorState.create({ doc, selection: inCell! });
        expect(isTableEscapeSelection(state)).toBe(false);
    });
});
