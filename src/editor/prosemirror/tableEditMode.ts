import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";

export const TABLE_EDIT_MODE_KEY = new PluginKey<Set<string>>("tableEditMode");

export const tableEditModePlugin = () =>
    new Plugin({
        key: TABLE_EDIT_MODE_KEY,
        state: {
            init: () => new Set<string>(),
            apply(tr, editing) {
                const meta = tr.getMeta(TABLE_EDIT_MODE_KEY) as
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

export const tableEditIds = (state: EditorState): Set<string> =>
    TABLE_EDIT_MODE_KEY.getState(state) ?? new Set();

export const isTableEditing = (state: EditorState, elementId: string): boolean =>
    tableEditIds(state).has(elementId);

export const setTableEditing = (
    tr: Transaction,
    elementId: string,
    editing: boolean,
): Transaction =>
    tr.setMeta(
        TABLE_EDIT_MODE_KEY,
        editing ? { enter: elementId } : { exit: elementId },
    );
