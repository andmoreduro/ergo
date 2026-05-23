import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export interface EditCommandDeps {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
}

export const editCommands = (deps: EditCommandDeps): Command[] => [
    {
        id: "edit::Undo",
        label: m.menubar_undo(),
        scope: "project",
        isEnabled: () => deps.canUndo,
        run: deps.undo,
    },
    {
        id: "edit::Redo",
        label: m.menubar_redo(),
        scope: "project",
        isEnabled: () => deps.canRedo,
        run: deps.redo,
    },
];
