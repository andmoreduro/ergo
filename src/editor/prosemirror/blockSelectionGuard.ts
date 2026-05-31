import { NodeSelection, Plugin, TextSelection } from "prosemirror-state";
import type { EditorState, Selection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockEditIds, setBlockEditing } from "./blockEditMode";
import { ATOM_BLOCK_NODES, BLOCK_ELEMENT_NODES } from "./schema";

interface EditingRange {
    elementId: string;
    from: number;
    to: number;
    isAtom: boolean;
}

/** Doc ranges of every block element currently in fine-grained mode. */
const editingRanges = (state: EditorState): EditingRange[] => {
    const ids = blockEditIds(state);
    if (ids.size === 0) {
        return [];
    }
    const ranges: EditingRange[] = [];
    state.doc.descendants((node, pos) => {
        if (BLOCK_ELEMENT_NODES.has(node.type.name)) {
            const elementId = node.attrs.elementId as string;
            if (elementId && ids.has(elementId)) {
                ranges.push({
                    elementId,
                    from: pos,
                    to: pos + node.nodeSize,
                    isAtom: ATOM_BLOCK_NODES.has(node.type.name),
                });
            }
            return false; // never descend into a block element
        }
        return node.isBlock;
    });
    return ranges;
};

const selectionInside = (selection: Selection, range: EditingRange): boolean => {
    if (range.isAtom) {
        return (
            selection instanceof NodeSelection && selection.from === range.from
        );
    }
    return selection.from >= range.from && selection.to <= range.to;
};

/**
 * While a block element is in fine-grained mode, keep the selection inside it.
 * Any transaction whose selection lands outside — Ctrl+Arrow word motion,
 * Ctrl+Home/End, PageUp/Down, Ctrl+A, edge arrows, native caret drift — is
 * corrected back in. This is the mirror of `tableSelectionGuard`, which forces
 * the selection ONTO the wrapper while the block is locked. The only sanctioned
 * exits flip edit mode off in the same transaction, so they are not clamped.
 */
export const blockSelectionGuardPlugin = () =>
    new Plugin({
        appendTransaction(_transactions, oldState, newState) {
            const ranges = editingRanges(newState);
            if (ranges.length === 0) {
                return null;
            }
            const selection = newState.selection;
            if (ranges.some((range) => selectionInside(selection, range))) {
                return null;
            }
            // Escaped — clamp back into the block the selection most recently
            // occupied, falling back to the first editing block.
            const previous = editingRanges(oldState).find((range) =>
                selectionInside(oldState.selection, range),
            );
            const target =
                ranges.find(
                    (range) => range.elementId === previous?.elementId,
                ) ?? ranges[0];
            if (target.isAtom) {
                return newState.tr.setSelection(
                    NodeSelection.create(newState.doc, target.from),
                );
            }
            // Search inward from the edge the selection escaped past, so the
            // caret lands in the nearest cell rather than jumping back out.
            const escapedAfter = selection.from >= target.to;
            const anchor = escapedAfter ? target.to - 1 : target.from + 1;
            const bias = escapedAfter ? -1 : 1;
            const near = TextSelection.near(newState.doc.resolve(anchor), bias);
            if (near.from <= target.from || near.from >= target.to) {
                // No text position inside (e.g. empty container) — re-lock whole.
                return newState.tr.setSelection(
                    NodeSelection.create(newState.doc, target.from),
                );
            }
            return newState.tr.setSelection(near);
        },
    });

/**
 * Clicking the empty paper below the content should land on the last block. When
 * that block is a block element (atom/table), ProseMirror can't place a text
 * caret there and falls back to the document start — so a click in the bottom
 * padding jumps the caret to the top. This intercepts a click below the last
 * block and, if it is a block element, selects it (NodeSelection); otherwise it
 * lets ProseMirror place the caret natively (a text block handles its own click).
 */
export const clickBelowLastBlockPlugin = () =>
    new Plugin({
        props: {
            handleDOMEvents: {
                mousedown(view: EditorView, event: MouseEvent) {
                    // Only act on clicks that miss all content (the empty paper).
                    const targetEl = event.target as HTMLElement | null;
                    if (targetEl && targetEl.closest("[data-pm-nodeview]")) {
                        return false;
                    }
                    const { doc } = view.state;
                    if (doc.childCount === 0) {
                        return false;
                    }
                    const lastIndex = doc.childCount - 1;
                    const lastChild = doc.child(lastIndex);
                    if (!BLOCK_ELEMENT_NODES.has(lastChild.type.name)) {
                        return false;
                    }
                    // Position before the last top-level block.
                    let lastPos = 0;
                    for (let i = 0; i < lastIndex; i += 1) {
                        lastPos += doc.child(i).nodeSize;
                    }
                    const dom = view.nodeDOM(lastPos);
                    if (!(dom instanceof HTMLElement)) {
                        return false;
                    }
                    const rect = dom.getBoundingClientRect();
                    if (event.clientY <= rect.bottom) {
                        // Click is within/above the block — let normal handling
                        // (including the block's own NodeView) take it.
                        return false;
                    }
                    view.dispatch(
                        view.state.tr.setSelection(
                            NodeSelection.create(view.state.doc, lastPos),
                        ),
                    );
                    view.focus();
                    event.preventDefault();
                    return true;
                },
            },
        },
    });

/**
 * A pointer-down outside every editing block is a sanctioned exit: leave
 * fine-grained mode so the caret can land where the user clicked. Without this,
 * the clamp guard above would pull the selection straight back in.
 *
 * This runs as a CAPTURE-phase listener on the editor root so it fires before any
 * block's own NodeView `mousedown` listener (and before that NodeView's
 * `stopEvent` can swallow the event, which is what made `handleDOMEvents` miss
 * clicks landing on a different block). It only clears edit mode and refocuses
 * the view — it does NOT `preventDefault`, so the click then proceeds natively to
 * place the caret (clicking neutral content) or to let the target block's own
 * listener select it (clicking another block). Refocus is required because an
 * atom's editor (e.g. the equation textarea) held DOM focus outside ProseMirror;
 * without it the first click would only exit and a second would be needed.
 */
export const blockOutsidePointerPlugin = () =>
    new Plugin({
        view(view: EditorView) {
            const onMouseDownCapture = (event: MouseEvent) => {
                const ranges = editingRanges(view.state);
                if (ranges.length === 0) {
                    return;
                }
                const target = event.target as globalThis.Node | null;
                const insideEditing = ranges.some((range) => {
                    const dom = view.nodeDOM(range.from);
                    return dom instanceof HTMLElement && dom.contains(target);
                });
                if (insideEditing) {
                    // Click within the editing block — let it handle its own
                    // caret/cell placement.
                    return;
                }
                let tr = view.state.tr;
                for (const range of ranges) {
                    tr = setBlockEditing(tr, range.elementId, false);
                }
                const hit = view.posAtCoords({
                    left: event.clientX,
                    top: event.clientY,
                });
                if (hit) {
                    tr = tr.setSelection(
                        TextSelection.near(view.state.doc.resolve(hit.pos), 1),
                    );
                }
                view.dispatch(tr);
                // Pull focus back into ProseMirror (it may have been in an atom's
                // external editor) so the caret is live after a single click.
                view.focus();
            };
            view.dom.addEventListener("mousedown", onMouseDownCapture, true);
            return {
                destroy() {
                    view.dom.removeEventListener(
                        "mousedown",
                        onMouseDownCapture,
                        true,
                    );
                },
            };
        },
    });
