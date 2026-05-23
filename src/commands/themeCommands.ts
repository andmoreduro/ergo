import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export interface ThemeCommandDeps {
    setThemeMode: (mode: "system" | "light" | "dark") => void;
}

export const themeCommands = (deps: ThemeCommandDeps): Command[] => [
    {
        id: "theme::UseSystem",
        label: m.menubar_theme_system(),
        scope: "global",
        run: () => deps.setThemeMode("system"),
    },
    {
        id: "theme::UseLight",
        label: m.menubar_theme_light(),
        scope: "global",
        run: () => deps.setThemeMode("light"),
    },
    {
        id: "theme::UseDark",
        label: m.menubar_theme_dark(),
        scope: "global",
        run: () => deps.setThemeMode("dark"),
    },
];
