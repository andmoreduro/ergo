import type { Command } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import type { Node as PMNode, Schema } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
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

const listEditingContext = (
    $from: import("prosemirror-model").ResolvedPos,
): {
    itemDepth: number;
    listDepth: number;
    item: PMNode;
    list: PMNode;
    itemIndex: number;
    itemPos: number;
    listPos: number;
} | null => {
    if ($from.parent.type.name !== "paragraph") {
        return null;
    }
    const itemDepth = $from.depth - 1;
    if (itemDepth < 1) {
        return null;
    }
    if ($from.node(itemDepth).type.name !== "list_item") {
        return null;
    }
    if ($from.index(itemDepth) !== 0) {
        return null;
    }
    const listDepth = itemDepth - 1;
    if ($from.node(listDepth).type.name !== "list") {
        return null;
    }
    return {
        itemDepth,
        listDepth,
        item: $from.node(itemDepth),
        list: $from.node(listDepth),
        itemIndex: $from.index(listDepth),
        itemPos: $from.before(itemDepth),
        listPos: $from.before(listDepth),
    };
};

const emptyListItemAtCursor = (
    $from: import("prosemirror-model").ResolvedPos,
): ReturnType<typeof listEditingContext> => {
    const ctx = listEditingContext($from);
    if (!ctx) {
        return null;
    }
    const paragraph = listItemParagraph(ctx.item);
    if (!paragraph) {
        return null;
    }
    const offset = $from.parentOffset;
    const before = paragraph.content.cut(0, offset);
    const after = paragraph.content.cut(offset);
    if (before.size !== 0 || after.size !== 0) {
        return null;
    }
    return ctx;
};

const buildListItem = (
    schema: Schema,
    paragraphContent: import("prosemirror-model").Fragment,
    nested: PMNode | null,
): PMNode => {
    const children = [
        schema.nodes.paragraph.create({ elementId: "" }, paragraphContent),
    ];
    if (nested) {
        children.push(nested);
    }
    return schema.nodes.list_item.create(null, children);
};

const replaceListWithParagraph = (
    schema: Schema,
    tr: import("prosemirror-state").Transaction,
    listPos: number,
    list: PMNode,
): { tr: import("prosemirror-state").Transaction; selectionPos: number } => {
    const elementId = (list.attrs.elementId as string) || "";
    const paragraph = schema.nodes.paragraph.create({ elementId }, []);
    const nextTr = tr.replaceWith(listPos, listPos + list.nodeSize, paragraph);
    return { tr: nextTr, selectionPos: listPos + 1 };
};

const listExitBlocks = (
    schema: Schema,
    list: PMNode,
    itemIndex: number,
): PMNode[] => {
    const itemsBefore: PMNode[] = [];
    const itemsAfter: PMNode[] = [];
    list.forEach((child, _offset, index) => {
        if (index < itemIndex) {
            itemsBefore.push(child);
        } else if (index > itemIndex) {
            itemsAfter.push(child);
        }
    });
    const paragraph = schema.nodes.paragraph.create({ elementId: "" }, []);
    const blocks: PMNode[] = [];
    if (itemsBefore.length > 0) {
        blocks.push(schema.nodes.list.create(list.attrs, itemsBefore));
    }
    blocks.push(paragraph);
    if (itemsAfter.length > 0) {
        blocks.push(schema.nodes.list.create(list.attrs, itemsAfter));
    }
    return blocks;
};

const paragraphContentPos = (blockStart: number): number => blockStart + 1;

const findParagraphPosInBlocks = (startPos: number, blocks: PMNode[]): number => {
    let pos = startPos;
    for (const block of blocks) {
        if (block.type.name === "paragraph") {
            return paragraphContentPos(pos);
        }
        pos += block.nodeSize;
    }
    return startPos + 1;
};

type EmptyListItemMode = "delete" | "exit";

const handleEmptyListItem = (
    state: import("prosemirror-state").EditorState,
    dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined,
    mode: EmptyListItemMode,
): boolean => {
    const { $from, empty } = state.selection;
    if (!empty && !state.selection.isTextSelection) {
        return false;
    }

    const ctx = emptyListItemAtCursor($from);
    if (!ctx) {
        return false;
    }

    const { item, list, itemIndex, itemPos, listPos } = ctx;
    const { schema } = state;

    if (list.childCount === 1) {
        const { tr, selectionPos } = replaceListWithParagraph(
            schema,
            state.tr,
            listPos,
            list,
        );
        dispatch?.(
            tr
                .setSelection(TextSelection.near(tr.doc.resolve(selectionPos), 1))
                .scrollIntoView(),
        );
        return true;
    }

    if (mode === "delete") {
        let tr = state.tr.delete(itemPos, itemPos + item.nodeSize);
        const mappedPos = tr.mapping.map(itemPos);
        dispatch?.(
            tr
                .setSelection(TextSelection.near(tr.doc.resolve(mappedPos), -1))
                .scrollIntoView(),
        );
        return true;
    }

    const blocks = listExitBlocks(schema, list, itemIndex);
    let tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, blocks);
    const selectionPos = findParagraphPosInBlocks(listPos, blocks);
    dispatch?.(
        tr
            .setSelection(TextSelection.near(tr.doc.resolve(selectionPos), 1))
            .scrollIntoView(),
    );
    return true;
};

/** Backspace on an empty list item: delete it (never nest like Tab). */
export const deleteEmptyListItem: Command = (state, dispatch) =>
    handleEmptyListItem(state, dispatch, "delete");

/** Enter inside a list item: split or exit/remove an empty item. */
export const splitListItem: Command = (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty && !state.selection.isTextSelection) {
        return false;
    }

    if (emptyListItemAtCursor($from)) {
        return handleEmptyListItem(state, dispatch, "exit");
    }

    const ctx = listEditingContext($from);
    if (!ctx) {
        return false;
    }

    const { itemDepth, itemPos, item, list } = ctx;
    const paragraph = listItemParagraph(item);
    if (!paragraph) {
        return false;
    }

    const offset = $from.parentOffset;
    const before = paragraph.content.cut(0, offset);
    const after = paragraph.content.cut(offset);
    const nested = nestedListInItem(item);
    const { schema } = state;

    const currentItem = buildListItem(schema, before, nested);
    const nextItem = buildListItem(schema, after, null);
    let tr = state.tr.replaceWith(itemPos, itemPos + item.nodeSize, currentItem);
    const insertPos = itemPos + currentItem.nodeSize;
    tr = tr.insert(insertPos, nextItem);
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1), 1));
    dispatch?.(tr.scrollIntoView());
    return true;
};

export const runListEnter = (view: EditorView): boolean =>
    splitListItem(view.state, view.dispatch, view);

export const runListBackspace = (view: EditorView): boolean =>
    deleteEmptyListItem(view.state, view.dispatch, view);
