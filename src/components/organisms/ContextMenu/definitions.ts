import type { ActionId } from "../../../bindings/ActionId";
import { editContextMenuEntries } from "../../../menus/editMenu";

export type ContextMenuSurface = "app" | "workspace";

export type ContextMenuEntry =
    | { type: "separator" }
    | { type: "command"; commandId: ActionId }
    | { type: "placeholder"; label: string }
    | { type: "inspect"; debugOnly: true };

const WORKSPACE_MENU: ContextMenuEntry[] = [
    ...editContextMenuEntries(),
    { type: "separator" },
    { type: "command", commandId: "view::OpenCommandPalette" },
    { type: "separator" },
    { type: "inspect", debugOnly: true },
];

export const CONTEXT_MENU_DEFINITIONS: Record<
    ContextMenuSurface,
    ContextMenuEntry[]
> = {
    app: [
        { type: "command", commandId: "view::OpenCommandPalette" },
        { type: "separator" },
        { type: "inspect", debugOnly: true },
    ],
    workspace: WORKSPACE_MENU,
};
