import { baseKeymap } from "prosemirror-commands";
import type { Node as PMNode } from "prosemirror-model";
import {
    NodeSelection,
    TextSelection,
    type Command,
    type Selection,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
    TableMap,
    isInTable,
    moveCellForward,
    selectedRect,
    selectionCell,
} from "prosemirror-tables";
import { ATOM_BLOCK_NODES, TABLE_BLOCK_NODE } from "./schema";
import {
    isTableBlockFocused,
    tableBlockGapFocus,
} from "./tableBlockFocus";
import { isBlockEditing, setBlockEditing } from "./blockEditMode";

const TABLE_NODE = "table";
const BLOCK_SELECTABLE = new Set([TABLE_BLOCK_NODE, ...ATOM_BLOCK_NODES]);

const tableElementIdAt = (
    state: import("prosemirror-state").EditorState,
): string | null => {
    if (!isInTable(state)) {
        return null;
    }
    const $cell = selectionCell(state);
    for (let depth = $cell.depth; depth > 0; depth -= 1) {
        if ($cell.node(depth).type.name === TABLE_BLOCK_NODE) {
            return $cell.node(depth).attrs.elementId as string;
        }
    }
    return null;
};

/** True when the caret is in a table that is in fine-grained (cell) edit mode. */
export const canMoveBetweenTableCells = (
    state: import("prosemirror-state").EditorState,
): boolean => {
    const elementId = tableElementIdAt(state);
    return elementId !== null && isBlockEditing(state, elementId);
};

export type TableArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** Caret at the near edge of a cell (start, or end when entering from right/top). */
const cellCaretSelection = (
    doc: PMNode,
    cellPos: number,
    atEnd: boolean,
): Selection | null => {
    const cell = doc.nodeAt(cellPos);
    if (!cell) {
        return null;
    }
    const inner = atEnd ? cellPos + 1 + cell.content.size : cellPos + 1;
    return TextSelection.near(doc.resolve(inner), atEnd ? -1 : 1);
};

/**
 * Open the table identified by `elementId` directly in fine-grained mode with a
 * collapsed caret in its first cell. Used after a fresh table insert so the user
 * can start typing immediately instead of first selecting then entering the block.
 */
export const enterTableBlockById = (
    view: EditorView,
    elementId: string,
): boolean => {
    const { doc } = view.state;
    let blockPos = -1;
    doc.descendants((node, pos) => {
        if (blockPos !== -1) {
            return false;
        }
        if (
            node.type.name === TABLE_BLOCK_NODE &&
            node.attrs.elementId === elementId
        ) {
            blockPos = pos;
            return false;
        }
        return true;
    });
    if (blockPos === -1) {
        return false;
    }
    let tr = view.state.tr.setSelection(NodeSelection.create(doc, blockPos));
    tr = setBlockEditing(tr, elementId, true);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
};

/**
 * Move a collapsed caret to the adjacent cell in `direction`, wrapping within the
 * same column (up/down) or row (left/right). The caret lands at the near edge of
 * the target cell instead of selecting its contents.
 */
export const moveCellDirectional = (
    view: EditorView,
    direction: "up" | "down" | "left" | "right",
): boolean => {
    const { state } = view;
    if (!isInTable(state)) {
        return false;
    }
    const { map, table, tableStart } = selectedRect(state);
    const $cell = selectionCell(state);
    const here = map.findCell($cell.pos - tableStart);
    const rows = map.height;
    const cols = map.width;
    let row = here.top;
    let col = here.left;
    if (direction === "up") {
        row = (here.top - 1 + rows) % rows;
    } else if (direction === "down") {
        row = (here.top + 1) % rows;
    } else if (direction === "left") {
        col = (here.left - 1 + cols) % cols;
    } else {
        col = (here.left + 1) % cols;
    }
    const cellPos = tableStart + map.positionAt(row, col, table);
    const atEnd = direction === "left" || direction === "up";
    const selection = cellCaretSelection(state.doc, cellPos, atEnd);
    if (!selection) {
        return false;
    }
    view.dispatch(state.tr.setSelection(selection).scrollIntoView());
    return true;
};

/** Plain arrow keys while editing table cells: caret within the cell, then hop. */
export const runInTableArrow = (
    view: EditorView,
    direction: "left" | "right" | "up" | "down",
): boolean => {
    const { state } = view;
    if (!canMoveBetweenTableCells(state)) {
        return false;
    }
    if (!(state.selection instanceof TextSelection)) {
        return false;
    }
    if (!view.endOfTextblock(direction)) {
        const key =
            direction === "left"
                ? "ArrowLeft"
                : direction === "right"
                  ? "ArrowRight"
                  : direction === "up"
                    ? "ArrowUp"
                    : "ArrowDown";
        const cmd = baseKeymap[key];
        if (cmd && cmd(state, view.dispatch, view)) {
            return true;
        }
    }
    return moveCellDirectional(view, direction);
};

const ARROW_TO_DIR: Record<TableArrowKey, "up" | "down" | "left" | "right"> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
};

/** Alt+arrow: hop to the adjacent cell (collapsed caret, wraps within row/column). */
export const runAltTableCellNavigate = (
    view: EditorView,
    key: TableArrowKey,
): boolean => {
    if (!canMoveBetweenTableCells(view.state)) {
        return false;
    }
    return moveCellDirectional(view, ARROW_TO_DIR[key]);
};

/** Leave cell editing and return to table block focus (gap before wrapper). */
export const exitTable: Command = (state, dispatch) => {
    if (!isInTable(state)) {
        return false;
    }
    const $head = state.selection.$head;
    for (let depth = $head.depth; depth > 0; depth -= 1) {
        if ($head.node(depth).type.name !== TABLE_BLOCK_NODE) {
            continue;
        }
        const elementId = $head.node(depth).attrs.elementId as string;
        const blockPos = $head.before(depth);
        if (!dispatch) {
            return true;
        }
        let tr = state.tr.setSelection(NodeSelection.create(state.doc, blockPos));
        tr = setBlockEditing(tr, elementId, false);
        dispatch(tr.scrollIntoView());
        return true;
    }
    return false;
};

export const tableBlockFromSelection = (
    state: import("prosemirror-state").EditorState,
): { block: PMNode; tablePos: number; elementId: string } | null => {
    const { selection } = state;
    if (selection instanceof NodeSelection) {
        if (selection.node.type.name !== TABLE_BLOCK_NODE) {
            return null;
        }
        return {
            block: selection.node,
            tablePos: selection.from,
            elementId: selection.node.attrs.elementId as string,
        };
    }
    const gap = tableBlockGapFocus(state);
    if (!gap) {
        return null;
    }
    const block = state.doc.nodeAt(gap.tablePos);
    if (!block || block.type.name !== TABLE_BLOCK_NODE) {
        return null;
    }
    return { block, tablePos: gap.tablePos, elementId: gap.elementId };
};

export const enterTableFirstCell: Command = (state, dispatch) => {
    const located = tableBlockFromSelection(state);
    if (!located || !isTableBlockFocused(state)) {
        return false;
    }
    const { tablePos, elementId } = located;
    if (dispatch) {
        let tr = state.tr.setSelection(NodeSelection.create(state.doc, tablePos));
        tr = setBlockEditing(tr, elementId, true);
        dispatch(tr.scrollIntoView());
    }
    return true;
};

/** Enter fine-grained mode for a whole-selected atom block (equation, figure, …). */
export const enterAtomBlock = (view: EditorView): boolean => {
    const { selection } = view.state;
    if (!(selection instanceof NodeSelection)) {
        return false;
    }
    const node = selection.node;
    if (!ATOM_BLOCK_NODES.has(node.type.name)) {
        return false;
    }
    const pos = selection.from;
    const elementId =
        ((node.attrs.element as { id?: string } | null)?.id ??
            (node.attrs.elementId as string)) ||
        "";
    if (!elementId || isBlockEditing(view.state, elementId)) {
        return false;
    }
    view.dispatch(setBlockEditing(view.state.tr, elementId, true));
    requestAnimationFrame(() => {
        const dom = view.nodeDOM(pos);
        if (dom instanceof HTMLElement) {
            dom
                .querySelector<HTMLElement>(
                    "input, textarea, select, button, [contenteditable]",
                )
                ?.focus();
        }
    });
    return true;
};

/** Index and start position of the top-level block containing the selection. */
const topLevelBlockAt = (
    $from: import("prosemirror-model").ResolvedPos,
): { index: number; start: number } | null => {
    let found: { index: number; start: number } | null = null;
    $from.doc.forEach((node, offset, index) => {
        if ($from.pos < offset + 1 || $from.pos > offset + node.nodeSize - 1) {
            return;
        }
        found = { index, start: offset };
    });
    return found;
};

const selectTableBlock = (
    state: import("prosemirror-state").EditorState,
    dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined,
    pos: number,
) => {
    if (dispatch) {
        dispatch(
            state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView(),
        );
    }
    return true;
};

const selectBlockNode = (
    state: import("prosemirror-state").EditorState,
    dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined,
    pos: number,
) => {
    const node = state.doc.nodeAt(pos);
    if (node?.type.name === TABLE_BLOCK_NODE) {
        return selectTableBlock(state, dispatch, pos);
    }
    if (dispatch) {
        dispatch(
            state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView(),
        );
    }
    return true;
};

const textBlockStart = (doc: PMNode, pos: number): number => {
    const node = doc.nodeAt(pos);
    if (!node) {
        return pos + 1;
    }
    return pos + 1;
};

export const arrowTowardNextBlock = (direction: 1 | -1): Command => {
    return (state, dispatch, view) => {
        if (isInTable(state)) {
            return false;
        }
        if (
            state.selection instanceof NodeSelection &&
            state.selection.node.type.name === TABLE_BLOCK_NODE
        ) {
            return navigateAdjacentBlock(direction)(state, dispatch);
        }
        const selection = state.selection;
        if (selection instanceof NodeSelection) {
            const name = selection.node.type.name;
            if (!BLOCK_SELECTABLE.has(name)) {
                return false;
            }
            const $pos = state.doc.resolve(selection.from);
            const candidate = direction > 0 ? $pos.nodeAfter : $pos.nodeBefore;
            if (!candidate) {
                return false;
            }
            const candidatePos =
                direction > 0
                    ? selection.from + selection.node.nodeSize
                    : selection.from - candidate.nodeSize;
            if (candidate.isTextblock) {
                if (dispatch) {
                    dispatch(
                        state.tr
                            .setSelection(
                                TextSelection.create(
                                    state.doc,
                                    textBlockStart(state.doc, candidatePos),
                                ),
                            )
                            .scrollIntoView(),
                    );
                }
                return true;
            }
            if (BLOCK_SELECTABLE.has(candidate.type.name)) {
                return selectBlockNode(state, dispatch, candidatePos);
            }
            return false;
        }

        if (!(selection instanceof TextSelection) || !selection.empty) {
            return false;
        }
        const $from = selection.$from;
        const block = topLevelBlockAt($from);
        if (!block) {
            return false;
        }
        const { index, start: blockStart } = block;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= state.doc.childCount) {
            return false;
        }

        if (view) {
            const atBoundary =
                direction > 0
                    ? view.endOfTextblock("down")
                    : view.endOfTextblock("up");
            if (!atBoundary) {
                return false;
            }
        } else {
            const blockNode = state.doc.child(index);
            const boundary =
                direction > 0
                    ? $from.pos >= blockStart + blockNode.nodeSize - 1
                    : $from.pos <= blockStart + 1;
            if (!boundary) {
                return false;
            }
        }

        const sibling = state.doc.child(nextIndex);
        const current = state.doc.child(index);
        const siblingPos =
            direction > 0
                ? blockStart + current.nodeSize
                : blockStart - sibling.nodeSize;

        if (BLOCK_SELECTABLE.has(sibling.type.name)) {
            return selectBlockNode(state, dispatch, siblingPos);
        }
        return false;
    };
};

/** Move between top-level blocks when a block (e.g. table) is selected as a whole. */
export const navigateAdjacentBlock = (direction: 1 | -1): Command => {
    return (state, dispatch) => {
        const selection = state.selection;
        if (!(selection instanceof NodeSelection)) {
            return false;
        }
        if (!BLOCK_SELECTABLE.has(selection.node.type.name)) {
            return false;
        }
        let blockIndex = -1;
        state.doc.forEach((_node, offset, index) => {
            if (offset === selection.from) {
                blockIndex = index;
            }
        });
        if (blockIndex < 0) {
            return false;
        }
        const nextIndex = blockIndex + direction;
        if (nextIndex < 0 || nextIndex >= state.doc.childCount) {
            return false;
        }
        const sibling = state.doc.child(nextIndex);
        const siblingPos =
            direction > 0
                ? selection.from + selection.node.nodeSize
                : selection.from - sibling.nodeSize;
        if (sibling.isTextblock) {
            if (dispatch) {
                dispatch(
                    state.tr
                        .setSelection(
                            TextSelection.create(
                                state.doc,
                                textBlockStart(state.doc, siblingPos),
                            ),
                        )
                        .scrollIntoView(),
                );
            }
            return true;
        }
        if (BLOCK_SELECTABLE.has(sibling.type.name)) {
            return selectBlockNode(state, dispatch, siblingPos);
        }
        return false;
    };
};

const crossToBlockHorizontally = (view: EditorView, dir: 1 | -1): boolean => {
    const { state } = view;
    const sel = state.selection;
    if (!(sel instanceof TextSelection) || !sel.empty || isInTable(state)) {
        return false;
    }
    if (!view.endOfTextblock(dir > 0 ? "right" : "left")) {
        return false;
    }
    const block = topLevelBlockAt(sel.$from);
    if (!block) {
        return false;
    }
    const nextIndex = block.index + dir;
    if (nextIndex < 0 || nextIndex >= state.doc.childCount) {
        return false;
    }
    const sibling = state.doc.child(nextIndex);
    const current = state.doc.child(block.index);
    const siblingPos =
        dir > 0 ? block.start + current.nodeSize : block.start - sibling.nodeSize;
    if (BLOCK_SELECTABLE.has(sibling.type.name)) {
        return selectBlockNode(state, view.dispatch, siblingPos);
    }
    return false;
};

export const runBodyNavigate = (
    view: EditorView,
    direction: "up" | "down" | "left" | "right",
): boolean => {
    const { state } = view;
    if (isTableBlockFocused(state)) {
        const blockDir =
            direction === "down" || direction === "right"
                ? 1
                : direction === "up" || direction === "left"
                  ? -1
                  : 0;
        if (blockDir === 0) {
            return false;
        }
        const gap = tableBlockGapFocus(state);
        if (gap) {
            selectTableBlock(state, view.dispatch, gap.tablePos);
            return true;
        }
        return navigateAdjacentBlock(blockDir)(state, view.dispatch);
    }
    if (state.selection instanceof NodeSelection) {
        if (!BLOCK_SELECTABLE.has(state.selection.node.type.name)) {
            return false;
        }
        if (direction === "up" || direction === "down") {
            const blockDir = direction === "down" ? 1 : -1;
            return arrowTowardNextBlock(blockDir)(state, view.dispatch, view);
        }
        const blockDir = direction === "right" ? 1 : -1;
        return navigateAdjacentBlock(blockDir)(state, view.dispatch);
    }

    if (isInTable(state) && canMoveBetweenTableCells(state)) {
        if (runInTableArrow(view, direction)) {
            return true;
        }
    }

    if (direction === "up" || direction === "down") {
        const blockDir = direction === "down" ? 1 : -1;
        if (arrowTowardNextBlock(blockDir)(state, view.dispatch, view)) {
            return true;
        }
    }
    if (direction === "left" || direction === "right") {
        const blockDir = direction === "right" ? 1 : -1;
        if (crossToBlockHorizontally(view, blockDir)) {
            return true;
        }
    }
    const key =
        direction === "left"
            ? "ArrowLeft"
            : direction === "right"
              ? "ArrowRight"
              : direction === "up"
                ? "ArrowUp"
                : "ArrowDown";
    const cmd = baseKeymap[key];
    if (!cmd) {
        return false;
    }
    return cmd(state, view.dispatch, view);
};
