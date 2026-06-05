import { describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { createListItem } from "../../state/ast/defaults";
import { elementToNode, listItemParagraph } from "./astBridge";
import { indentListItem, liftListItem } from "./listIndent";
import { bodySchema } from "./schema";

const listDoc = () => {
    const list = {
        type: "List" as const,
        id: "l1",
        items: [createListItem("one"), createListItem("two"), createListItem("three")],
    };
    return bodySchema.nodes.doc.create(null, [elementToNode(bodySchema, list)]);
};

const listItemTextPos = (doc: ReturnType<typeof listDoc>, itemIndex: number): number => {
    const list = doc.child(0);
    let pos = 1;
    for (let index = 0; index < itemIndex; index += 1) {
        pos += list.child(index).nodeSize;
    }
    return pos + 2;
};

const nestedListItemTextPos = (
    doc: ReturnType<typeof listDoc>,
    parentItemIndex: number,
    nestedItemIndex: number,
): number => {
    const list = doc.child(0);
    let pos = 1;
    for (let index = 0; index < parentItemIndex; index += 1) {
        pos += list.child(index).nodeSize;
    }
    const parentItem = list.child(parentItemIndex);
    const paragraph = listItemParagraph(parentItem);
    if (!paragraph) {
        return pos + 2;
    }
    pos += 1 + paragraph.nodeSize + 1;
    const nested = parentItem.lastChild;
    if (!nested || nested.type.name !== "list") {
        return pos + 2;
    }
    for (let index = 0; index < nestedItemIndex; index += 1) {
        pos += nested.child(index).nodeSize;
    }
    return pos + 2;
};

describe("list indent commands", () => {
    it("nests the second item under the first on Tab", () => {
        const doc = listDoc();
        let state = EditorState.create({
            doc,
            selection: TextSelection.create(doc, listItemTextPos(doc, 1)),
        });
        const ok = indentListItem(state, (tr) => {
            state = state.apply(tr);
        });
        expect(ok).toBe(true);
        const list = state.doc.child(0);
        expect(list.childCount).toBe(2);
        const firstItem = list.child(0);
        const nested = firstItem.lastChild;
        expect(nested?.type.name).toBe("list");
        expect(nested?.childCount).toBe(1);
    });

    it("does not indent the first item", () => {
        const doc = listDoc();
        const state = EditorState.create({
            doc,
            selection: TextSelection.create(doc, 3),
        });
        expect(indentListItem(state, undefined)).toBe(false);
    });

    it("lifts a nested item without leaving an empty nested list", () => {
        const doc = listDoc();
        let state = EditorState.create({
            doc,
            selection: TextSelection.create(doc, listItemTextPos(doc, 1)),
        });
        indentListItem(state, (tr) => {
            state = state.apply(tr);
        });

        const nestedList = state.doc.child(0).child(0).lastChild;
        expect(nestedList?.type.name).toBe("list");
        state = EditorState.create({
            doc: state.doc,
            selection: TextSelection.create(state.doc, nestedListItemTextPos(state.doc, 0, 0)),
        });

        const ok = liftListItem(state, (tr) => {
            state = state.apply(tr);
        });
        expect(ok).toBe(true);

        const list = state.doc.child(0);
        expect(list.childCount).toBe(3);
        const firstItem = list.child(0);
        expect(nestedListInItem(firstItem)).toBeNull();
        expect(list.child(1).textContent).toBe("two");
        expect(list.child(2).textContent).toBe("three");
    });
});

const nestedListInItem = (item: import("prosemirror-model").Node) => {
    let nested: import("prosemirror-model").Node | null = null;
    item.forEach((child) => {
        if (child.type.name === "list") {
            nested = child;
        }
    });
    return nested;
};
