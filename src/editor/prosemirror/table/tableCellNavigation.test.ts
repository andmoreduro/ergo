import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createRichText } from "../../../state/ast/defaults";
import { tableSchema } from "./tableSchema";
import { tableToSubDoc } from "./tableSubBridge";
import { moveTableCellSelection } from "./tableCellNavigation";
import { tableCellCoordsFromChildState } from "./tableCellFocus";

const twoCellRowTable = {
    type: "Table" as const,
    id: "t1",
    rows: 1,
    cols: 2,
    cells: [
        [
            {
                elements: [
                    {
                        type: "Paragraph" as const,
                        id: "cell-p-a",
                        content: [createRichText("left")],
                    },
                ],
                row_span: null,
                col_span: null,
            },
            {
                elements: [
                    {
                        type: "Paragraph" as const,
                        id: "cell-p-b",
                        content: [createRichText("right")],
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

describe("moveTableCellSelection", () => {
    it("moves to the adjacent cell on Alt+arrow right", () => {
        const doc = tableToSubDoc(tableSchema, twoCellRowTable);
        let state = EditorState.create({
            doc,
            selection: TextSelection.create(doc, 4),
        });

        const mount = document.createElement("div");
        document.body.appendChild(mount);
        const view = new EditorView(mount, {
            state,
            dispatchTransaction(tr) {
                state = state.apply(tr);
                view.updateState(state);
            },
        });

        expect(tableCellCoordsFromChildState(view.state)?.col).toBe(0);
        expect(moveTableCellSelection(view, "right")).toBe(true);
        expect(tableCellCoordsFromChildState(view.state)?.col).toBe(1);

        view.destroy();
        mount.remove();
    });
});
