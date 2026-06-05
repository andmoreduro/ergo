import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export interface BibliographyCommandDeps {
    exportBibliography: () => Promise<void>;
}

export const bibliographyCommands = (
    deps: BibliographyCommandDeps,
): Command[] => [
    {
        id: "bibliography::ExportBib",
        label: m.menubar_export_bibliography(),
        scope: "project",
        isEnabled: (context) => context.hasActiveProject,
        run: deps.exportBibliography,
    },
];
