import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { Node as PMNode, Schema } from "prosemirror-model";
import { listItemParagraph } from "./astBridge";

const nestedListInItem = (item: PMNode): PMNode | null => {
    let nested: PMNode | null = null;
    item.forEach((child) => {
        if (child.type.name === "list") {
            nested = child;
        }
    });
    return nested;
};

const rebuildListItem = (
    schema: Schema,
    item: PMNode,
    nested: PMNode | null,
): PMNode => {
    const paragraph = listItemParagraph(item);
    if (!paragraph) {
        return item;
    }
    const children = [paragraph];
    if (nested) {
        children.push(nested);
    }
    return schema.nodes.list_item.create(null, children);
};

const listItemAtCursor = (
    $pos: import("prosemirror-model").ResolvedPos,
): {
    itemDepth: number;
    listDepth: number;
    index: number;
} | null => {
    let itemDepth = -1;
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if ($pos.node(depth).type.name === "list_item") {
            itemDepth = depth;
            break;
        }
    }
    if (itemDepth < 0) {
        return null;
    }

    for (let depth = itemDepth + 1; depth <= $pos.depth; depth += 1) {
        if ($pos.node(depth).type.name === "list") {
            return null;
        }
    }

    const listDepth = itemDepth - 1;
    if ($pos.node(listDepth).type.name !== "list") {
        return null;
    }

    return {
        itemDepth,
        listDepth,
        index: $pos.index(listDepth),
    };
};

const selectionPosInListItem = (
    listPos: number,
    list: PMNode,
    itemIndex: number,
    nestedItemIndex?: number,
): number => {
    let pos = listPos + 1;
    for (let index = 0; index < itemIndex; index += 1) {
        pos += list.child(index).nodeSize;
    }
    if (nestedItemIndex === undefined) {
        return pos + 2;
    }
    const parentItem = list.child(itemIndex);
    pos += 1 + listItemParagraph(parentItem)!.nodeSize + 1;
    const nested = nestedListInItem(parentItem);
    if (!nested) {
        return pos + 2;
    }
    for (let index = 0; index < nestedItemIndex; index += 1) {
        pos += nested.child(index).nodeSize;
    }
    return pos + 2;
};

/** Tab: nest the current item under the previous sibling (not allowed for item 0). */
export const indentListItem: Command = (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty && !state.selection.isTextSelection) {
        return false;
    }

    const info = listItemAtCursor($from);
    if (!info || info.index === 0) {
        return false;
    }

    const { schema } = state;
    const list = $from.node(info.listDepth);
    const item = $from.node(info.itemDepth);
    const prevItem = list.child(info.index - 1);
    const ordered = list.attrs.ordered as boolean;

    const existingNested = nestedListInItem(prevItem);
    let newPrevItem: PMNode;
    if (existingNested) {
        const nestedItems: PMNode[] = [];
        existingNested.forEach((child) => {
            nestedItems.push(child);
        });
        nestedItems.push(item);
        const newNested = schema.nodes.list.create(existingNested.attrs, nestedItems);
        newPrevItem = rebuildListItem(schema, prevItem, newNested);
    } else {
        const newNested = schema.nodes.list.create({ elementId: "", ordered }, [item]);
        newPrevItem = rebuildListItem(schema, prevItem, newNested);
    }

    const newListItems: PMNode[] = [];
    list.forEach((child, _offset, index) => {
        if (index === info.index - 1) {
            newListItems.push(newPrevItem);
        } else if (index !== info.index) {
            newListItems.push(child);
        }
    });

    const newList = schema.nodes.list.create(list.attrs, newListItems);
    const listPos = $from.before(info.listDepth);
    let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, newList);
    const nestedIndex = existingNested ? existingNested.childCount : 0;
    const selectionPos = selectionPosInListItem(
        listPos,
        newList,
        info.index - 1,
        nestedIndex,
    );
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos), 1));
    dispatch?.(tr.scrollIntoView());
    return true;
};

/** Shift+Tab: move a nested item up one list level. */
export const liftListItem: Command = (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty && !state.selection.isTextSelection) {
        return false;
    }

    const info = listItemAtCursor($from);
    if (!info) {
        return false;
    }

    const innerListDepth = info.listDepth;
    const parentItemDepth = innerListDepth - 1;
    if (parentItemDepth < 1 || $from.node(parentItemDepth).type.name !== "list_item") {
        return false;
    }

    const outerListDepth = parentItemDepth - 1;
    if ($from.node(outerListDepth).type.name !== "list") {
        return false;
    }

    const { schema } = state;
    const innerList = $from.node(innerListDepth);
    const item = $from.node(info.itemDepth);
    const parentItem = $from.node(parentItemDepth);
    const outerList = $from.node(outerListDepth);
    const parentItemIndex = $from.index(outerListDepth);

    const remainingNestedItems: PMNode[] = [];
    innerList.forEach((child, _offset, index) => {
        if (index !== info.index) {
            remainingNestedItems.push(child);
        }
    });

    let newParentItem: PMNode;
    if (remainingNestedItems.length === 0) {
        newParentItem = rebuildListItem(schema, parentItem, null);
    } else {
        const newNested = schema.nodes.list.create(innerList.attrs, remainingNestedItems);
        newParentItem = rebuildListItem(schema, parentItem, newNested);
    }

    const newOuterItems: PMNode[] = [];
    outerList.forEach((child, _offset, index) => {
        if (index === parentItemIndex) {
            newOuterItems.push(newParentItem);
            newOuterItems.push(item);
        } else {
            newOuterItems.push(child);
        }
    });

    const newOuterList = schema.nodes.list.create(outerList.attrs, newOuterItems);
    const outerListPos = $from.before(outerListDepth);
    let tr = state.tr.replaceWith(
        outerListPos,
        outerListPos + outerList.nodeSize,
        newOuterList,
    );
    const selectionPos = selectionPosInListItem(outerListPos, newOuterList, parentItemIndex + 1);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos), 1));
    dispatch?.(tr.scrollIntoView());
    return true;
};

export const runListTab = (view: EditorView, shiftKey: boolean): boolean => {
    const command = shiftKey ? liftListItem : indentListItem;
    return command(view.state, view.dispatch, view);
};
