import type { Command } from "./types";
import { m } from "../paraglide/messages.js";
import type { SettingsPanel } from "../components/organisms/SettingsDialog/SettingsDialog";

export interface SettingsCommandDeps {
    setSettingsPanel: (panel: SettingsPanel | null) => void;
    setCommandPaletteOpen: (open: boolean) => void;
}

export const settingsCommands = (deps: SettingsCommandDeps): Command[] => [
    {
        id: "settings::OpenGlobal",
        label: m.menubar_global_settings(),
        scope: "global",
        run: () => deps.setSettingsPanel("global"),
    },
    {
        id: "settings::OpenProject",
        label: m.menubar_project_settings(),
        scope: "project",
        isEnabled: (context) => context.hasActiveProject,
        run: () => deps.setSettingsPanel("project"),
    },
    {
        id: "settings::OpenKeymap",
        label: m.menubar_keymap_settings(),
        scope: "global",
        run: () => deps.setSettingsPanel("keymap"),
    },
    {
        id: "settings::Close",
        label: m.command_palette_close(),
        scope: "global",
        run: () => {
            deps.setSettingsPanel(null);
            deps.setCommandPaletteOpen(false);
        },
    },
];
