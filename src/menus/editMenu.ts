import type { ActionId } from "../bindings/ActionId";
import type { ContextMenuEntry } from "../components/organisms/ContextMenu/definitions";
import { m } from "../paraglide/messages.js";

export type EditMenuItem =
    | { kind: "command"; commandId: ActionId }
    | { kind: "placeholder"; label: string };

/** Same entries as the former Edit menubar menu. */
export const EDIT_MENU_ITEMS: EditMenuItem[] = [
    { kind: "command", commandId: "edit::Undo" },
    { kind: "command", commandId: "edit::Redo" },
    { kind: "placeholder", label: m.menubar_cut() },
    { kind: "placeholder", label: m.menubar_copy() },
    { kind: "placeholder", label: m.menubar_paste() },
    { kind: "command", commandId: "editor::DeleteElement" },
];

export const editContextMenuEntries = (): ContextMenuEntry[] =>
    EDIT_MENU_ITEMS.map((item) =>
        item.kind === "command"
            ? { type: "command", commandId: item.commandId }
            : { type: "placeholder", label: item.label },
    );
