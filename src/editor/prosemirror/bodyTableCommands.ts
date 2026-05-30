import { baseKeymap } from "prosemirror-commands";
import type { Node as PMNode } from "prosemirror-model";
import { NodeSelection, TextSelection, type Command } from "prosemirror-state";
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
import { isTableEditing, setTableEditing } from "./tableEditMode";

const TABLE_NODE = "table";
const BLOCK_SELECTABLE = new Set([TABLE_BLOCK_NODE, ...ATOM_BLOCK_NODES]);

const CELL_TYPES = new Set(["table_cell", "table_header"]);

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
    return elementId !== null && isTableEditing(state, elementId);
};

export type TableArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

type CellAxis = "horiz" | "vert";
type CellDir = -1 | 1;

/** One step to a neighboring cell; returns false at table edges (no wrap). */
export const moveTableCellAdjacent = (axis: CellAxis, dir: CellDir): Command => {
    return (state, dispatch) => {
        if (!isInTable(state)) {
            return false;
        }
        const { tableStart, map } = selectedRect(state);
        const $cell = selectionCell(state);
        const cellOffset = $cell.pos - tableStart;
        const nextOffset = map.nextCell(cellOffset, axis, dir);
        if (nextOffset == null) {
            return false;
        }
        const $next = state.doc.resolve(tableStart + nextOffset);
        if (dispatch) {
            dispatch(
                state.tr
                    .setSelection(
                        TextSelection.between($next, moveCellForward($next)),
                    )
                    .scrollIntoView(),
            );
        }
        return true;
    };
};

const CELL_DELTA: Record<TableArrowKey, [axis: CellAxis, dir: CellDir]> = {
    ArrowLeft: ["horiz", -1],
    ArrowRight: ["horiz", 1],
    ArrowUp: ["vert", -1],
    ArrowDown: ["vert", 1],
};

const IN_TABLE_ARROW: Record<
    "left" | "right" | "up" | "down",
    { key: TableArrowKey; axis: CellAxis; dir: CellDir }
> = {
    left: { key: "ArrowLeft", axis: "horiz", dir: -1 },
    right: { key: "ArrowRight", axis: "horiz", dir: 1 },
    up: { key: "ArrowUp", axis: "vert", dir: -1 },
    down: { key: "ArrowDown", axis: "vert", dir: 1 },
};

const textBlockEnd = (doc: PMNode, blockPos: number): number => {
    const node = doc.nodeAt(blockPos);
    if (!node) {
        return blockPos;
    }
    return blockPos + node.nodeSize - 1;
};

/** Leave the table vertically when the caret is on the first/last row and cannot move up/down. */
const navigateFromTableCellEdge = (
    state: import("prosemirror-state").EditorState,
    dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined,
    view: EditorView,
    direction: "up" | "down",
): boolean => {
    if (!isInTable(state) || !view.endOfTextblock(direction)) {
        return false;
    }
    const { tableStart, map } = selectedRect(state);
    const $cell = selectionCell(state);
    const cellOffset = $cell.pos - tableStart;
    const vertDir = direction === "up" ? -1 : 1;
    if (map.nextCell(cellOffset, "vert", vertDir) != null) {
        return false;
    }

    let tableBlockPos: number | null = null;
    for (let depth = $cell.depth; depth > 0; depth -= 1) {
        if ($cell.node(depth).type.name === TABLE_BLOCK_NODE) {
            tableBlockPos = $cell.before(depth);
            break;
        }
    }
    if (tableBlockPos === null) {
        return false;
    }

    let blockIndex = -1;
    state.doc.forEach((_node, offset, index) => {
        if (offset === tableBlockPos) {
            blockIndex = index;
        }
    });
    if (blockIndex < 0) {
        return false;
    }
    const siblingIndex = blockIndex + (direction === "up" ? -1 : 1);
    if (siblingIndex < 0 || siblingIndex >= state.doc.childCount) {
        return false;
    }
    const tableBlock = state.doc.child(blockIndex);
    const sibling = state.doc.child(siblingIndex);
    const siblingPos =
        direction === "up"
            ? tableBlockPos - sibling.nodeSize
            : tableBlockPos + tableBlock.nodeSize;

    if (sibling.isTextblock) {
        const pos =
            direction === "up"
                ? textBlockEnd(state.doc, siblingPos)
                : textBlockStart(state.doc, siblingPos);
        if (dispatch) {
            dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos)).scrollIntoView());
        }
        return true;
    }
    if (BLOCK_SELECTABLE.has(sibling.type.name)) {
        return selectBlockNode(state, dispatch, siblingPos);
    }
    return false;
};

const stepCaretWithinCell = (
    state: import("prosemirror-state").EditorState,
    dispatch: ((tr: import("prosemirror-state").Transaction) => void) | undefined,
    delta: number,
): boolean => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.empty) {
        return false;
    }
    const $from = selection.$from;
    let cellDepth = -1;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
        if (CELL_TYPES.has($from.node(depth).type.name)) {
            cellDepth = depth;
            break;
        }
    }
    if (cellDepth < 0) {
        return false;
    }
    const next = selection.head + delta;
    if (next <= $from.start(cellDepth) || next >= $from.end(cellDepth)) {
        return false;
    }
    if (dispatch) {
        dispatch(
            state.tr
                .setSelection(TextSelection.create(state.doc, next))
                .scrollIntoView(),
        );
    }
    return true;
};

const inTableArrow = (direction: "left" | "right" | "up" | "down"): Command => {
    return (state, dispatch, view) => {
        if (!canMoveBetweenTableCells(state) || !view) {
            return false;
        }
        if (!(state.selection instanceof TextSelection)) {
            return false;
        }

        const { key, axis, dir } = IN_TABLE_ARROW[direction];
        if (!view.endOfTextblock(direction)) {
            const cmd = baseKeymap[key];
            if (cmd?.(state, dispatch, view)) {
                return true;
            }
            if (direction === "left") {
                return stepCaretWithinCell(state, dispatch, -1);
            }
            if (direction === "right") {
                return stepCaretWithinCell(state, dispatch, 1);
            }
            return false;
        }

        if (moveTableCellAdjacent(axis, dir)(state, dispatch)) {
            return true;
        }
        if (direction === "up" || direction === "down") {
            return navigateFromTableCellEdge(state, dispatch, view, direction);
        }
        return true;
    };
};

/** Plain arrow keys while editing table cells (caret movement + edge crossing). */
export const runInTableArrow = (
    view: EditorView,
    direction: "left" | "right" | "up" | "down",
): boolean => inTableArrow(direction)(view.state, view.dispatch, view);

/** Alt+arrow: move to the adjacent cell in that direction (no wrap). */
export const runAltTableCellNavigate = (
    view: EditorView,
    key: TableArrowKey,
): boolean => {
    if (!canMoveBetweenTableCells(view.state)) {
        return false;
    }
    const [axis, dir] = CELL_DELTA[key];
    return moveTableCellAdjacent(axis, dir)(view.state, view.dispatch);
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
        tr = setTableEditing(tr, elementId, false);
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
    const { block, tablePos, elementId } = located;
    const table = block.firstChild;
    if (!table || table.type.name !== TABLE_NODE) {
        return false;
    }
    const map = TableMap.get(table);
    const tableStart = tablePos + 1;
    const $cell = state.doc.resolve(tableStart + map.positionAt(0, 0, table));
    if (dispatch) {
        let tr = state.tr.setSelection(
            TextSelection.between($cell, moveCellForward($cell)),
        );
        tr = setTableEditing(tr, elementId, true);
        dispatch(tr.scrollIntoView());
    }
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
