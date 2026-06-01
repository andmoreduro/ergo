import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { goToNextCell, isInTable } from "prosemirror-tables";
import {
    canMoveBetweenTableCells,
    enterAtomBlock,
    enterTableFirstCell,
    exitTable,
    moveCellDirectional,
    runAltTableCellNavigate,
    runBodyNavigate,
    tableBlockFromSelection,
    type TableArrowKey,
} from "./bodyTableCommands";
import {
    getActiveBodyView,
    getBodyHistoryActions,
    getBodyParagraphInsert,
} from "./activeView";
import { isTableBlockFocused } from "./tableBlockFocus";

const isMod = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

const isHistoryUndo = (event: KeyboardEvent) =>
    isMod(event) && event.key.toLowerCase() === "z" && !event.shiftKey;

const isHistoryRedo = (event: KeyboardEvent) =>
    isMod(event) &&
    (event.key.toLowerCase() === "y" ||
        (event.key.toLowerCase() === "z" && event.shiftKey));

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
 * Synchronous body shortcuts before `prosemirror-tables` keymaps run. The action
 * runtime resolves keys asynchronously; table block highlight, Alt+arrow cell
 * jumps, and plain-arrow caret rules are handled here.
 */
export const bodyKeyboardPlugin = () =>
    new Plugin({
        props: {
            handleKeyDown(view: EditorView, event: KeyboardEvent) {
                const mod = isMod(event);

                if (view === getActiveBodyView()) {
                    const history = getBodyHistoryActions();
                    if (history && isHistoryUndo(event) && history.canUndo()) {
                        history.undo();
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    if (history && isHistoryRedo(event) && history.canRedo()) {
                        history.redo();
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                }

                if (event.key === "Escape") {
                    if (isInTable(view.state)) {
                        if (exitTable(view.state, view.dispatch)) {
                            event.preventDefault();
                            event.stopPropagation();
                            return true;
                        }
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
                        if (enterTableFirstCell(view.state, view.dispatch)) {
                            event.preventDefault();
                            event.stopPropagation();
                            return true;
                        }
                        if (enterAtomBlock(view)) {
                            event.preventDefault();
                            event.stopPropagation();
                            return true;
                        }
                        return false;
                    }
                    if (isTableBlockFocused(view.state)) {
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    return false;
                }

                if (event.key === "Tab") {
                    // Tab on a locked/selected table or atom block enters fine-grained mode.
                    if (enterTableFirstCell(view.state, view.dispatch)) {
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    if (enterAtomBlock(view)) {
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                    return false;
                }

                if (!TABLE_ARROWS.has(event.key)) {
                    return false;
                }

                if (event.altKey && !mod && !event.shiftKey) {
                    if (canMoveBetweenTableCells(view.state)) {
                        runAltTableCellNavigate(view, event.key as TableArrowKey);
                        event.preventDefault();
                        event.stopPropagation();
                        return true;
                    }
                }

                // Ctrl/Cmd+arrow: word/line motion inside the cell, hop to the
                // adjacent cell only at the cell edge (in the arrow's direction).
                if (mod && !event.shiftKey && !event.altKey) {
                    if (canMoveBetweenTableCells(view.state)) {
                        const cdir = NAV_DIR[event.key];
                        if (cdir && view.endOfTextblock(cdir)) {
                            moveCellDirectional(view, cdir);
                            event.preventDefault();
                            event.stopPropagation();
                            return true;
                        }
                    }
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
