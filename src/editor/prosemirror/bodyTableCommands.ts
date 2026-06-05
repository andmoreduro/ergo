import { baseKeymap } from "prosemirror-commands";
import type { Node as PMNode } from "prosemirror-model";
import {
    NodeSelection,
    TextSelection,
    type Command,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { focusWrapperPrimary } from "../wrapperTabCycle";
import { ATOM_BLOCK_NODES, BLOCK_ELEMENT_NODES, TABLE_BLOCK_NODE } from "./schema";
import { isTableBlockFocused, tableBlockGapFocus } from "./tableBlockFocus";
import { isBlockEditing, setBlockEditing } from "./blockEditMode";
import { tryInlineEquationNavigation } from "./inlineEquationPlugin";

const BLOCK_SELECTABLE = new Set([TABLE_BLOCK_NODE, ...ATOM_BLOCK_NODES]);

export const elementIdFromBlockNode = (node: PMNode): string =>
    ((node.attrs.element as { id?: string } | null)?.id ??
        (node.attrs.elementId as string)) ||
    "";

/** Whole block selected in locked mode (not fine-grained editing). */
export const isLockedWholeBlockSelected = (
    state: import("prosemirror-state").EditorState,
): boolean => {
    if (isTableBlockFocused(state)) {
        return true;
    }
    const { selection } = state;
    if (!(selection instanceof NodeSelection)) {
        return false;
    }
    if (!BLOCK_SELECTABLE.has(selection.node.type.name)) {
        return false;
    }
    const elementId = elementIdFromBlockNode(selection.node);
    return Boolean(elementId && !isBlockEditing(state, elementId));
};

/** Element id when a block is whole-selected in locked mode, for Enter → new paragraph. */
export const lockedWholeBlockElementId = (
    state: import("prosemirror-state").EditorState,
): string | null => {
    if (!isLockedWholeBlockSelected(state)) {
        return null;
    }
    const { selection } = state;
    if (selection instanceof NodeSelection) {
        return elementIdFromBlockNode(selection.node) || null;
    }
    return tableBlockGapFocus(state)?.elementId ?? null;
};

/** Tab / Ctrl+Enter from locked whole-block selection → fine-grained mode. */
export const enterLockedWholeBlock = (view: EditorView): boolean => {
    const { selection } = view.state;
    if (selection instanceof NodeSelection) {
        const name = selection.node.type.name;
        if (name === TABLE_BLOCK_NODE) {
            const elementId = elementIdFromBlockNode(selection.node);
            if (elementId && !isBlockEditing(view.state, elementId)) {
                return enterTableBlockById(view, elementId);
            }
        }
    }
    if (enterTableFirstCell(view.state, view.dispatch)) {
        return true;
    }
    return enterAtomBlock(view);
};

/**
 * Open the table identified by `elementId` in fine-grained mode (caret in first cell).
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
 * Open any block element (`elementId`) directly in fine-grained mode. Tables put
 * the caret in their first cell; atom blocks (equation, figure, diagram) focus
 * their primary field. Used right after inserting a block so the user types into
 * it instead of replacing the still-node-selected block.
 */
export const enterBlockEditById = (
    view: EditorView,
    elementId: string,
): boolean => {
    const { doc } = view.state;
    let blockPos = -1;
    let isTable = false;
    doc.forEach((node, offset) => {
        if (blockPos !== -1) {
            return;
        }
        if (
            BLOCK_ELEMENT_NODES.has(node.type.name) &&
            elementIdFromBlockNode(node) === elementId
        ) {
            blockPos = offset;
            isTable = node.type.name === TABLE_BLOCK_NODE;
        }
    });
    if (blockPos === -1) {
        return false;
    }
    let tr = view.state.tr.setSelection(NodeSelection.create(doc, blockPos));
    tr = setBlockEditing(tr, elementId, true);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    if (!isTable) {
        // The atom's React field only becomes editable once edit mode renders;
        // focus its primary field on the next frame.
        const pos = blockPos;
        requestAnimationFrame(() => {
            const dom = view.nodeDOM(pos);
            if (dom instanceof HTMLElement) {
                focusWrapperPrimary(dom);
            }
        });
    }
    return true;
};

export const tableBlockFromSelection = (
    state: import("prosemirror-state").EditorState,
): { tablePos: number; elementId: string } | null => {
    const gap = tableBlockGapFocus(state);
    if (!gap) {
        return null;
    }
    const block = state.doc.nodeAt(gap.tablePos);
    if (!block || block.type.name !== TABLE_BLOCK_NODE) {
        return null;
    }
    return { tablePos: gap.tablePos, elementId: gap.elementId };
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
    const elementId = elementIdFromBlockNode(node);
    if (!elementId || isBlockEditing(view.state, elementId)) {
        return false;
    }
    if (node.type.name === TABLE_BLOCK_NODE) {
        view.dispatch(setBlockEditing(view.state.tr, elementId, true).scrollIntoView());
        view.focus();
        return true;
    }
    view.dispatch(setBlockEditing(view.state.tr, elementId, true).scrollIntoView());
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
        focusWrapperPrimary(dom);
    }
    return true;
};

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
            // `selection.from` sits directly before the selected node, so
            // `$pos.nodeAfter` is the node ITSELF, not the following sibling.
            // Derive the candidate from the target position instead — otherwise
            // the branch below runs off the (block-selectable) atom and
            // node-selects whatever sits at `candidatePos`, e.g. a plain
            // paragraph, giving it a stray whole-block outline.
            const before = $pos.nodeBefore;
            if (direction < 0 && !before) {
                return false;
            }
            const candidatePos =
                direction > 0
                    ? selection.from + selection.node.nodeSize
                    : selection.from - (before?.nodeSize ?? 0);
            const candidate = state.doc.nodeAt(candidatePos);
            if (!candidate) {
                return false;
            }
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
    if (!(sel instanceof TextSelection) || !sel.empty) {
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
    if (tryInlineEquationNavigation(view, direction)) {
        return true;
    }

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
