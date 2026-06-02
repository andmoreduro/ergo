import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { createRichText, createTable } from "../../state/ast/defaults";
import { bodySchema } from "./schema";
import { blockEditModePlugin, setBlockEditing } from "./blockEditMode";
import { blockSelectionGuardPlugin } from "./blockSelectionGuard";

const n = bodySchema.nodes;

const buildTableDoc = (): { doc: PMNode; blockSize: number } => {
    const table = createTable(1, 1, "tbl1");
    if (table.type !== "Table") {
        throw new Error("expected table");
    }
    table.cells[0][0].elements = [
        { type: "Paragraph", id: "cell-p", content: [createRichText("hi")] },
    ];
    const block = n.table_block.create({
        elementId: "tbl1",
        element: table,
    });
    const para = n.paragraph.create(
        { elementId: "p1" },
        bodySchema.text("outside"),
    );
    return { doc: n.doc.create(null, [block, para]), blockSize: block.nodeSize };
};

const stateWith = (doc: PMNode) =>
    EditorState.create({
        doc,
        plugins: [blockEditModePlugin(), blockSelectionGuardPlugin()],
    });

describe("blockSelectionGuard", () => {
    it("leaves the selection alone when no block is editing", () => {
        const { doc, blockSize } = buildTableDoc();
        let state = stateWith(doc);
        const outside = blockSize + 1;
        state = state.apply(
            state.tr.setSelection(TextSelection.create(state.doc, outside)),
        );
        expect(state.selection.from).toBe(outside);
    });

    it("keeps a node selection on an editing table atom", () => {
        const { doc } = buildTableDoc();
        let state = stateWith(doc);
        state = state.apply(
            setBlockEditing(
                state.tr.setSelection(NodeSelection.create(state.doc, 0)),
                "tbl1",
                true,
            ),
        );
        expect(state.selection).toBeInstanceOf(NodeSelection);
    });
});
