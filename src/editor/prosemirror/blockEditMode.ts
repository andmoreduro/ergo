import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";

/**
 * Tracks which block elements are in fine-grained ("edit") mode, keyed by
 * `elementId`. A block element (table, equation, figure, diagram, custom) is
 * normally locked: the caret can only select it as a whole. Entering edit mode
 * unlocks its interior; exiting re-locks it. The set is element-agnostic — both
 * the `table_block` wrapper and the atom NodeViews share it.
 */
export const BLOCK_EDIT_MODE_KEY = new PluginKey<Set<string>>("blockEditMode");

export const blockEditModePlugin = () =>
    new Plugin({
        key: BLOCK_EDIT_MODE_KEY,
        state: {
            init: () => new Set<string>(),
            apply(tr, editing) {
                const meta = tr.getMeta(BLOCK_EDIT_MODE_KEY) as
                    | { enter?: string; exit?: string }
                    | undefined;
                if (!meta) {
                    return editing;
                }
                const next = new Set(editing);
                if (meta.enter) {
                    next.add(meta.enter);
                }
                if (meta.exit) {
                    next.delete(meta.exit);
                }
                return next;
            },
        },
    });

export const blockEditIds = (state: EditorState): Set<string> =>
    BLOCK_EDIT_MODE_KEY.getState(state) ?? new Set();

export const isBlockEditing = (state: EditorState, elementId: string): boolean =>
    blockEditIds(state).has(elementId);

export const setBlockEditing = (
    tr: Transaction,
    elementId: string,
    editing: boolean,
): Transaction =>
    tr.setMeta(
        BLOCK_EDIT_MODE_KEY,
        editing ? { enter: elementId } : { exit: elementId },
    );
