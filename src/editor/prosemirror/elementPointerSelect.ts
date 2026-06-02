import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { blockEditIds } from "./blockEditMode";
import {
    blockIndexAtPos,
    selectBlockRange,
    selectionAnchorBlockIndex,
} from "./bodySelection";

/**
 * Mouse selection of whole elements.
 *
 *  - Shift+click extends the element selection from the current anchor to the
 *    clicked element (and shift-drag keeps extending).
 *  - A plain drag that crosses element boundaries selects whole elements; a drag
 *    that stays inside one text block is left to native text selection.
 *
 * Runs as a capture-phase listener on the editor root so it can pre-empt the atom
 * NodeViews' own `mousedown` handlers (which otherwise just node-select the one
 * block they sit on, breaking a drag across them). It never interferes while a
 * block is being edited fine-grained — that pointer belongs to the block.
 */
export const elementPointerSelectPlugin = () =>
    new Plugin({
        view(view: EditorView) {
            let anchorIndex: number | null = null;
            let dragging = false;

            const blockAt = (event: MouseEvent): number | null => {
                const at = view.posAtCoords({
                    left: event.clientX,
                    top: event.clientY,
                });
                return at ? blockIndexAtPos(view.state.doc, at.pos) : null;
            };

            const applyRange = (anchor: number, head: number) => {
                view.dispatch(
                    view.state.tr
                        .setSelection(selectBlockRange(view.state, anchor, head))
                        .scrollIntoView(),
                );
            };

            const onMouseMove = (event: MouseEvent) => {
                if (anchorIndex === null) {
                    return;
                }
                const idx = blockAt(event);
                if (idx === null) {
                    return;
                }
                // Stay native while the pointer remains in the starting block.
                if (idx === anchorIndex && !dragging) {
                    return;
                }
                dragging = true;
                applyRange(anchorIndex, idx);
                event.preventDefault();
            };

            const endDrag = () => {
                anchorIndex = null;
                dragging = false;
                document.removeEventListener("mousemove", onMouseMove, true);
                document.removeEventListener("mouseup", endDrag, true);
            };

            const onMouseDown = (event: MouseEvent) => {
                if (event.button !== 0) {
                    return;
                }
                // Editing a block: leave the pointer to that block's own editor.
                if (blockEditIds(view.state).size > 0) {
                    return;
                }
                const idx = blockAt(event);
                if (idx === null) {
                    return;
                }

                if (event.shiftKey) {
                    anchorIndex = selectionAnchorBlockIndex(view.state);
                    dragging = true;
                    applyRange(anchorIndex, idx);
                    view.focus();
                    event.preventDefault();
                    event.stopPropagation();
                    document.addEventListener("mousemove", onMouseMove, true);
                    document.addEventListener("mouseup", endDrag, true);
                    return;
                }

                // Plain press: arm a potential element drag, but let native handle
                // the click (caret / single-block select) until the pointer leaves
                // the starting block.
                anchorIndex = idx;
                dragging = false;
                document.addEventListener("mousemove", onMouseMove, true);
                document.addEventListener("mouseup", endDrag, true);
            };

            view.dom.addEventListener("mousedown", onMouseDown, true);
            return {
                destroy() {
                    view.dom.removeEventListener("mousedown", onMouseDown, true);
                    endDrag();
                },
            };
        },
    });
