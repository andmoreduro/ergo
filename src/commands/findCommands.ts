import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export interface FindCommandDeps {
    openFindBar: () => void;
    findNext: () => void;
    findPrevious: () => void;
}

export const findCommands = (deps: FindCommandDeps): Command[] => [
    {
        id: "editor::Find",
        label: m.menubar_find(),
        scope: "project",
        run: deps.openFindBar,
    },
    {
        id: "editor::FindNext",
        label: m.find_next(),
        scope: "project",
        run: deps.findNext,
    },
    {
        id: "editor::FindPrevious",
        label: m.find_previous(),
        scope: "project",
        run: deps.findPrevious,
    },
];
