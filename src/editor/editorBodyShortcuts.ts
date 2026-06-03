import type { ActionId } from "../bindings/ActionId";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import {
    isAltGrStyleChord,
    resolveShortcutKey,
} from "./shortcutKeyFromKeyboardEvent";
import { isActiveTableCellEditing } from "./prosemirror/table/tableCellInsertPolicy";

const isEditorInsertChord = (
    event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "getModifierState">,
): boolean => {
    if (event.ctrlKey && event.altKey) {
        return true;
    }
    return isAltGrStyleChord(event);
};

const insertByKey: Partial<Record<string, ActionId>> = {
    p: "editor::InsertParagraph",
    q: "editor::InsertQuote",
    t: "editor::InsertTable",
    e: "editor::InsertEquation",
    f: "editor::InsertFigure",
    d: "editor::InsertDiagram",
    l: "editor::InsertList",
    u: "editor::InsertEnumeration",
    i: "editor::InsertInlineEquation",
};

const tableCellBlocked: ReadonlySet<ActionId> = new Set([
    "editor::InsertHeading",
    "editor::InsertTable",
    "editor::InsertFigure",
    "editor::InsertDiagram",
]);

/**
 * Resolves editor insert shortcuts from physical keys (`event.code` via
 * `resolveShortcutKey`) so Ctrl+Alt / AltGr layouts match the default keymap
 * without waiting on async IPC (see UI Events KeyboardEvent code vs key).
 */
export const resolveBodyEditorInsertShortcut = (
    event: KeyboardEvent,
): ActionInvocation | null => {
    if (!isEditorInsertChord(event)) {
        return null;
    }

    const key = resolveShortcutKey(event);

    if (event.shiftKey && key >= "1" && key <= "6") {
        const invocation: ActionInvocation = {
            id: "editor::InsertHeading",
            payload: { level: Number(key) },
        };
        if (
            isActiveTableCellEditing() &&
            tableCellBlocked.has(invocation.id)
        ) {
            return invocation;
        }
        return invocation;
    }

    if (event.shiftKey) {
        if (key === "r") {
            return { id: "editor::InsertReference", payload: null };
        }
        return null;
    }

    const actionId = insertByKey[key];
    if (!actionId) {
        return null;
    }

    if (isActiveTableCellEditing() && tableCellBlocked.has(actionId)) {
        return { id: actionId, payload: null };
    }

    return { id: actionId, payload: null };
};
