import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export const helpCommands = (): Command[] => [
    {
        id: "help::OpenDocumentation",
        label: m.menubar_documentation(),
        scope: "global",
        isEnabled: () => false,
        run: () => undefined,
    },
    {
        id: "help::OpenAbout",
        label: m.menubar_about(),
        scope: "global",
        isEnabled: () => false,
        run: () => undefined,
    },
];
