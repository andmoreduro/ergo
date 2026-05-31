import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { bodySchema } from "./schema";
import { blockEditModePlugin, setBlockEditing } from "./blockEditMode";
import { blockSelectionGuardPlugin } from "./blockSelectionGuard";

const n = bodySchema.nodes;

const buildTableDoc = (): { doc: PMNode; blockSize: number } => {
    const cell = n.table_cell.create(null, bodySchema.text("hi"));
    const row = n.table_row.create(null, cell);
    const table = n.table.create(null, row);
    const block = n.table_block.create({ elementId: "tbl1" }, table);
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
    it("clamps an escaping selection back inside an editing table", () => {
        const { doc, blockSize } = buildTableDoc();
        let state = stateWith(doc);
        // Caret inside the first cell, then enter fine-grained mode.
        state = state.apply(
            setBlockEditing(
                state.tr.setSelection(TextSelection.create(state.doc, 4)),
                "tbl1",
                true,
            ),
        );

        // Simulate any escape (Ctrl+Arrow, Ctrl+A, …) landing in the paragraph.
        const outside = blockSize + 1;
        state = state.apply(
            state.tr.setSelection(TextSelection.create(state.doc, outside)),
        );

        expect(state.selection.from).toBeGreaterThan(0);
        expect(state.selection.to).toBeLessThan(blockSize);
    });

    it("leaves the selection alone when no block is editing", () => {
        const { doc, blockSize } = buildTableDoc();
        let state = stateWith(doc);
        const outside = blockSize + 1;
        state = state.apply(
            state.tr.setSelection(TextSelection.create(state.doc, outside)),
        );
        expect(state.selection.from).toBe(outside);
    });

    it("does not interfere with caret motion inside the editing table", () => {
        const { doc } = buildTableDoc();
        let state = stateWith(doc);
        state = state.apply(setBlockEditing(state.tr, "tbl1", true));
        state = state.apply(
            state.tr.setSelection(TextSelection.create(state.doc, 4)),
        );
        expect(state.selection.from).toBe(4);
    });
});
