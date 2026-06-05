import { describe, expect, it } from "vitest";
import { EditorState } from "prosemirror-state";
import { createListItem } from "../../state/ast/defaults";
import { elementToNode } from "./astBridge";
import { splitListItem } from "./listEnter";
import { selectionForFocusTarget } from "./selection";
import { bodySchema } from "./schema";

const listDoc = (items = [createListItem("one"), createListItem("two")]) => {
    const list = {
        type: "List" as const,
        id: "l1",
        items,
    };
    return bodySchema.nodes.doc.create(null, [elementToNode(bodySchema, list)]);
};

describe("splitListItem", () => {
    it("adds a new item when Enter is pressed at the end of an item", () => {
        const doc = listDoc();
        const selection = selectionForFocusTarget(doc, {
            elementId: "l1",
            fieldId: "l1:item:0",
            caretUtf16Offset: 3,
        });
        expect(selection).not.toBeNull();
        let state = EditorState.create({ doc, selection: selection! });
        const ok = splitListItem(state, (tr) => {
            state = state.apply(tr);
        });
        expect(ok).toBe(true);
        expect(state.doc.child(0).childCount).toBe(3);
    });

    it("unwraps a single empty list item into a paragraph", () => {
        const doc = listDoc([createListItem("")]);
        const selection = selectionForFocusTarget(doc, {
            elementId: "l1",
            fieldId: "l1:item:0",
            caretUtf16Offset: 0,
        });
        expect(selection).not.toBeNull();
        let state = EditorState.create({ doc, selection: selection! });
        const ok = splitListItem(state, (tr) => {
            state = state.apply(tr);
        });
        expect(ok).toBe(true);
        expect(state.doc.child(0).type.name).toBe("paragraph");
    });
});
