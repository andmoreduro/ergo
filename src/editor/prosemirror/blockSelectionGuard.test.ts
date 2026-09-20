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

const editingTableState = (doc: PMNode) =>
    stateWith(doc).apply(
        setBlockEditing(
            stateWith(doc).tr.setSelection(NodeSelection.create(doc, 0)),
            "tbl1",
            true,
        ),
    );

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

    it("keeps a selection that is inside the editing block", () => {
        const { doc } = buildTableDoc();
        const state = editingTableState(doc);
        expect(state.selection).toBeInstanceOf(NodeSelection);
    });

    it("clamps an escaped selection back onto the editing atom", () => {
        const { doc, blockSize } = buildTableDoc();
        const state = editingTableState(doc);

        // Simulate Ctrl+End / caret drift: a transaction moving the selection
        // into the paragraph after the editing table.
        const escaped = state.apply(
            state.tr.setSelection(
                TextSelection.create(state.doc, blockSize + 1),
            ),
        );

        expect(escaped.selection).toBeInstanceOf(NodeSelection);
        expect(escaped.selection.from).toBe(0);
    });

    it("does not clamp when edit mode is turned off in the same transaction", () => {
        const { doc, blockSize } = buildTableDoc();
        const state = editingTableState(doc);

        // Sanctioned exit: leaving fine-grained mode while moving the caret.
        const exited = state.apply(
            setBlockEditing(
                state.tr.setSelection(
                    TextSelection.create(state.doc, blockSize + 1),
                ),
                "tbl1",
                false,
            ),
        );

        expect(exited.selection).toBeInstanceOf(TextSelection);
        expect(exited.selection.from).toBe(blockSize + 1);
    });
});
