import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
    enterLockedWholeBlock,
    lockedWholeBlockElementId,
    runBodyNavigate,
    tableBlockFromSelection,
} from "./bodyTableCommands";
import { runBodyTab } from "./bodyTabCommand";
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
 * Synchronous body shortcuts before nested table keymaps run in the table NodeView.
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
