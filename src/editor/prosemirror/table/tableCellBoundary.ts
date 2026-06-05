import { Plugin } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { selectionCell, TableMap } from "prosemirror-tables";
import { arrowBetweenCellBlocks, cellBlockAtSelection } from "./tableCellFocus";

type TextblockEdge = "up" | "down" | "left" | "right";

const ARROW_EDGE: Record<string, TextblockEdge> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
};

/** True when a cell caret sits on the outer rim of the nested table grid. */
export const isTableCellAtOuterEdge = (
    state: EditorState,
    edge: TextblockEdge,
): boolean => {
    const table = state.doc.firstChild;
    if (!table || table.type.name !== "table") {
        return false;
    }
    const $cell = selectionCell(state);
    if (!$cell) {
        return false;
    }
    const map = TableMap.get(table);
    const cellRect = map.findCell($cell.pos - 1);
    switch (edge) {
        case "up":
            return cellRect.top === 0;
        case "down":
            return cellRect.bottom === map.height;
        case "left":
            return cellRect.left === 0;
        case "right":
            return cellRect.right === map.width;
        default:
            return false;
    }
};

/** Swallow only when the caret cannot move to another block in the same cell. */
export const shouldSwallowCellBoundaryArrow = (
    state: EditorState,
    edge: TextblockEdge,
): boolean => {
    if (!isTableCellAtOuterEdge(state, edge)) {
        return false;
    }
    const blockCtx = cellBlockAtSelection(state);
    if (!blockCtx) {
        return true;
    }
    const { cell, blockIndex } = blockCtx;
    switch (edge) {
        case "up":
        case "left":
            return blockIndex === 0;
        case "down":
        case "right":
            return blockIndex === cell.childCount - 1;
        default:
            return false;
    }
};

const isModArrow = (event: KeyboardEvent) =>
    (event.ctrlKey || event.metaKey) && !event.altKey;

/**
 * Keep Ctrl/Cmd+arrow from leaving the nested table at a cell rim. Plain arrows
 * use the same boundary rules; Alt+arrow is reserved for cell navigation.
 */
export const handleTableCellBoundaryArrow = (
    view: EditorView,
    event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
): boolean => {
    const edge = ARROW_EDGE[event.key];
    if (!edge || event.altKey) {
        return false;
    }

    const mod = isModArrow(event);
    if (!mod && (event.ctrlKey || event.metaKey || event.shiftKey)) {
        return false;
    }

    if (!shouldSwallowCellBoundaryArrow(view.state, edge)) {
        return false;
    }
    if (!view.endOfTextblock(edge)) {
        return false;
    }

    if (mod && (edge === "up" || edge === "down")) {
        const blockDir = edge === "down" ? 1 : -1;
        if (arrowBetweenCellBlocks(blockDir)(view.state, view.dispatch, view)) {
            return true;
        }
    }

    return true;
};

/**
 * Swallow arrow keys that would leave the nested table sub-doc. Without this,
 * `prosemirror-tables` falls back to a whole-table NodeSelection and typing
 * replaces the table.
 */
export const tableCellBoundaryPlugin = () =>
    new Plugin({
        props: {
            handleKeyDown(view: EditorView, event: KeyboardEvent) {
                if (!handleTableCellBoundaryArrow(view, event)) {
                    return false;
                }
                event.preventDefault();
                return true;
            },
        },
    });
