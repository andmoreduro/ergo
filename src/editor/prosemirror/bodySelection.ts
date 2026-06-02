import type { Node as PMNode } from "prosemirror-model";
import {
    AllSelection,
    NodeSelection,
    TextSelection,
    type Command,
    type EditorState,
    type Selection,
} from "prosemirror-state";
import "./bodySelection.global.css";

/** Position and size of the top-level block the selection currently sits in. */
const topLevelBlock = (
    state: EditorState,
): { pos: number; size: number } | null => {
    const selection = state.selection;
    const $from = selection.$from;
    // A NodeSelection of a top-level block resolves at doc depth 0; a caret or
    // range inside a text block resolves deeper, so walk out to depth 1.
    const pos = $from.depth === 0 ? selection.from : $from.before(1);
    const node = state.doc.nodeAt(pos);
    if (!node) {
        return null;
    }
    return { pos, size: node.nodeSize };
};

/**
 * True when the block at `[pos, pos + size)` should render its whole-block
 * highlight: a NodeSelection resting on it, or any non-empty selection (notably
 * `AllSelection` from select-all) that fully spans it. Drives the block UI
 * outline so select-all highlights every block the same way reaching it does.
 */
export const isBlockSelectionHighlighted = (
    selection: Selection,
    pos: number,
    size: number,
): boolean => {
    if (selection instanceof NodeSelection && selection.from === pos) {
        return true;
    }
    return (
        !selection.empty &&
        selection.from <= pos &&
        selection.to >= pos + size
    );
};

const blockOffsets = (doc: PMNode): number[] => {
    const offsets: number[] = [];
    let acc = 0;
    for (let i = 0; i < doc.childCount; i += 1) {
        offsets.push(acc);
        acc += doc.child(i).nodeSize;
    }
    return offsets;
};

/** Index of the top-level element containing (or nearest to) a doc position. */
export const blockIndexAtPos = (doc: PMNode, pos: number): number => {
    let acc = 0;
    for (let i = 0; i < doc.childCount; i += 1) {
        acc += doc.child(i).nodeSize;
        if (pos < acc) {
            return i;
        }
    }
    return Math.max(0, doc.childCount - 1);
};

/** Top-level element index the selection is anchored in (its fixed end). */
export const selectionAnchorBlockIndex = (state: EditorState): number =>
    blockIndexAtPos(state.doc, state.selection.anchor);

/**
 * A selection covering whole elements `[minIdx, maxIdx]`. A lone atom resolves to
 * a NodeSelection (its whole-block highlight); otherwise a text range whose
 * endpoints sit just inside text blocks, or at an atom's boundary so it is fully
 * covered (and thus highlighted by `isBlockSelectionHighlighted`).
 */
const blockRangeSelection = (
    doc: PMNode,
    minIdx: number,
    maxIdx: number,
): Selection => {
    const offsets = blockOffsets(doc);
    if (minIdx === maxIdx && !doc.child(minIdx).isTextblock) {
        return NodeSelection.create(doc, offsets[minIdx]);
    }
    const startEdge = (i: number): number =>
        doc.child(i).isTextblock ? offsets[i] + 1 : offsets[i];
    const endEdge = (i: number): number => {
        const size = doc.child(i).nodeSize;
        return doc.child(i).isTextblock
            ? offsets[i] + size - 1
            : offsets[i] + size;
    };
    return TextSelection.create(doc, startEdge(minIdx), endEdge(maxIdx));
};

/** Select whole elements between an anchor and head index (order-independent). */
export const selectBlockRange = (
    state: EditorState,
    anchorIdx: number,
    headIdx: number,
): Selection =>
    blockRangeSelection(
        state.doc,
        Math.min(anchorIdx, headIdx),
        Math.max(anchorIdx, headIdx),
    );

/**
 * Element-level Shift+Arrow: extend the selection by whole top-level elements.
 * From a collapsed caret the first press selects the current element; from an
 * existing selection it grows one element in `dir` (down = +1, up = -1). Returns
 * the new selection, or null if there is nothing further to cover.
 */
export const extendBlockSelection = (
    state: EditorState,
    dir: 1 | -1,
): Selection | null => {
    const { doc, selection } = state;
    if (doc.childCount === 0) {
        return null;
    }
    if (selection.empty) {
        // First press establishes the selection on the current element.
        const idx = blockIndexAtPos(doc, selection.from);
        return blockRangeSelection(doc, idx, idx);
    }
    let minIdx = blockIndexAtPos(doc, selection.from);
    let maxIdx = blockIndexAtPos(doc, Math.max(selection.from, selection.to - 1));
    if (dir > 0) {
        const next = Math.min(doc.childCount - 1, maxIdx + 1);
        if (next === maxIdx) {
            return null;
        }
        maxIdx = next;
    } else {
        const prev = Math.max(0, minIdx - 1);
        if (prev === minIdx) {
            return null;
        }
        minIdx = prev;
    }
    return blockRangeSelection(doc, minIdx, maxIdx);
};

/**
 * Esc-to-deselect: collapse a whole-element or range selection back to a caret at
 * its end. Returns the caret selection, or null when there is nothing to clear
 * (an ordinary caret is already collapsed).
 */
export const clearElementSelection = (state: EditorState): Selection | null => {
    const sel = state.selection;
    const hasElementSelection =
        sel instanceof NodeSelection ||
        sel instanceof AllSelection ||
        !sel.empty;
    if (!hasElementSelection) {
        return null;
    }
    const targetPos = Math.min(sel.to, state.doc.content.size);
    return TextSelection.near(state.doc.resolve(targetPos), -1);
};

/** Select the whole top-level element the selection is in (NodeSelection). */
export const selectCurrentElement: Command = (state, dispatch) => {
    const block = topLevelBlock(state);
    if (!block) {
        return false;
    }
    const selection = state.selection;
    if (selection instanceof NodeSelection && selection.from === block.pos) {
        return false; // already the current element — nothing to do
    }
    if (dispatch) {
        dispatch(
            state.tr
                .setSelection(NodeSelection.create(state.doc, block.pos))
                .scrollIntoView(),
        );
    }
    return true;
};

/**
 * Ctrl+A in the body: first press selects the current element (NodeSelection),
 * the next press escalates to every element (`AllSelection`). Returns true so the
 * browser never falls back to selecting the whole page.
 */
export const selectCurrentOrAllElements: Command = (state, dispatch) => {
    const selection = state.selection;
    if (selection instanceof AllSelection) {
        return true; // already everything
    }
    const block = topLevelBlock(state);
    if (!block) {
        if (dispatch) {
            dispatch(state.tr.setSelection(new AllSelection(state.doc)));
        }
        return true;
    }
    const alreadyCurrent =
        selection instanceof NodeSelection && selection.from === block.pos;
    if (dispatch) {
        const target = alreadyCurrent
            ? new AllSelection(state.doc)
            : NodeSelection.create(state.doc, block.pos);
        dispatch(state.tr.setSelection(target).scrollIntoView());
    }
    return true;
};
