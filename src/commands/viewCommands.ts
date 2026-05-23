import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export interface ViewCommandDeps {
    setCommandPaletteOpen: (open: boolean) => void;
}

export const viewCommands = (deps: ViewCommandDeps): Command[] => [
    {
        id: "view::OpenCommandPalette",
        label: m.menubar_command_palette(),
        scope: "global",
        run: () => deps.setCommandPaletteOpen(true),
    },
    {
        id: "view::ZoomIn",
        label: m.menubar_zoom_in(),
        scope: "global",
        isEnabled: () => false,
        run: () => undefined,
    },
    {
        id: "view::ZoomOut",
        label: m.menubar_zoom_out(),
        scope: "global",
        isEnabled: () => false,
        run: () => undefined,
    },
];
