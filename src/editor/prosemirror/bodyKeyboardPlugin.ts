import { Plugin, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
    blockIndexAtPos,
    clearElementSelection,
    extendBlockSelection,
    isBlockLevelTextSelection,
    isExtendingTextSelection,
    textSelectionHeadAtBlockEdge,
    wholeBlockSelectionAtIndex,
} from "./bodySelection";
import { blockEditIds } from "./blockEditMode";
import {
    enterLockedWholeBlock,
    lockedWholeBlockElementId,
    runBodyNavigate,
    tableBlockFromSelection,
} from "./bodyTableCommands";
import { runBodyTab } from "./bodyTabCommand";
import { runListEnter } from "./listEnter";
import { getBodyParagraphInsert } from "./activeView";
import { isTableBlockFocused } from "./tableBlockFocus";

const isMod = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

const NAV_DIR: Record<string, "left" | "right" | "up" | "down"> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
};

const TABLE_ARROWS = new Set<string>([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
]);

/**
 * Synchronous body shortcuts before nested table keymaps run in the table NodeView.
 */
export const bodyKeyboardPlugin = () =>
    new Plugin({
        props: {
            handleKeyDown(view: EditorView, event: KeyboardEvent) {
                const mod = isMod(event);

                // Esc clears a whole-element / range selection back to a caret.
                // While a block is edited fine-grained, Esc belongs to that block
                // (its NodeView exits edit mode), so leave it alone here.
                if (
                    event.key === "Escape" &&
                    !mod &&
                    blockEditIds(view.state).size === 0
                ) {
                    const caret = clearElementSelection(view.state);
                    if (caret) {
                        view.dispatch(
                            view.state.tr.setSelection(caret).scrollIntoView(),
                        );
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    return false;
                }

                if (event.key === "Tab") {
                    const handled = runBodyTab(view, {
                        shiftKey: event.shiftKey,
                        ctrlKey: event.ctrlKey,
                        metaKey: event.metaKey,
                    });
                    if (handled) {
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    return false;
                }

                if (event.key === "Enter") {
                    if (event.shiftKey && !mod) {
                        if (isTableBlockFocused(view.state)) {
                            const located = tableBlockFromSelection(view.state);
                            const insert = getBodyParagraphInsert();
                            if (located && insert) {
                                insert.insertBeforeElement(located.elementId);
                                event.preventDefault();
                                event.stopPropagation();
                                return true;
                            }
                        }
                        return false;
                    }
                    if (mod) {
                        if (enterLockedWholeBlock(view)) {
                            event.preventDefault();
                            event.stopPropagation();
                            return true;
                        }
                        return false;
                    }
                    if (runListEnter(view)) {
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    const lockedBlockId = lockedWholeBlockElementId(view.state);
                    const insert = getBodyParagraphInsert();
                    if (lockedBlockId && insert) {
                        insert.insertAfterElement(lockedBlockId);
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    return false;
                }

                // Shift+Up/Down selects whole elements once the moving end reaches a
                // block edge. Until then, defer to native line-by-line selection.
                if (
                    (event.key === "ArrowUp" || event.key === "ArrowDown") &&
                    event.shiftKey &&
                    !mod &&
                    !event.altKey
                ) {
                    const dir = event.key === "ArrowDown" ? 1 : -1;
                    const sel = view.state.selection;
                    if (sel instanceof TextSelection) {
                        if (!isBlockLevelTextSelection(view.state)) {
                            if (!textSelectionHeadAtBlockEdge(view.state, dir)) {
                                return false;
                            }
                            if (!isExtendingTextSelection(view.state, dir)) {
                                return false;
                            }
                            const blockIdx = blockIndexAtPos(
                                view.state.doc,
                                sel.head,
                            );
                            view.dispatch(
                                view.state.tr
                                    .setSelection(
                                        wholeBlockSelectionAtIndex(
                                            view.state.doc,
                                            blockIdx,
                                        ),
                                    )
                                    .scrollIntoView(),
                            );
                            event.preventDefault();
                            event.stopPropagation();
                            return true;
                        }
                        if (!isExtendingTextSelection(view.state, dir)) {
                            return false;
                        }
                    }
                    const next = extendBlockSelection(view.state, dir);
                    if (next) {
                        view.dispatch(
                            view.state.tr.setSelection(next).scrollIntoView(),
                        );
                    }
                    // Even at the document edge (next === null), swallow the key:
                    // the element selection is already maximal in this direction,
                    // so letting native run would collapse/wrap it to the start.
                    event.preventDefault();
                    event.stopPropagation();
                    return true;
                }

                if (!TABLE_ARROWS.has(event.key)) {
                    return false;
                }

                if (mod || event.shiftKey || event.altKey) {
                    return false;
                }

                const dir = NAV_DIR[event.key];
                if (!dir) {
                    return false;
                }

                if (runBodyNavigate(view, dir)) {
                    event.preventDefault();
                    event.stopPropagation();
                    return true;
                }

                if (isTableBlockFocused(view.state)) {
                    event.preventDefault();
                    event.stopPropagation();
                    return true;
                }

                return false;
            },
        },
    });
