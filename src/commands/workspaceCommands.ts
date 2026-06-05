import type { ExportFormat } from "../bindings/ExportFormat";
import type { Command } from "./types";
import { m } from "../paraglide/messages.js";

export interface WorkspaceCommandDeps {
    showNewProjectDialog: () => void;
    openProject: (path?: string) => Promise<void>;
    saveProject: () => void;
    closeProject: () => Promise<void>;
    showOpenRecentProjectsDialog: () => void;
    exportDocument: (format: ExportFormat) => Promise<void>;
}

export const workspaceCommands = (deps: WorkspaceCommandDeps): Command[] => [
    {
        id: "workspace::NewProject",
        label: m.menubar_new_project(),
        scope: "global",
        run: deps.showNewProjectDialog,
    },
    {
        id: "workspace::OpenProject",
        label: m.menubar_open_project(),
        scope: "global",
        run: () => deps.openProject(),
    },
    {
        id: "workspace::OpenRecentProject",
        label: m.action_workspace_open_recent_project(),
        scope: "global",
        run: deps.showOpenRecentProjectsDialog,
    },
    {
        id: "workspace::SaveProject",
        label: m.menubar_save_project(),
        scope: "project",
        isEnabled: (context) => context.hasActiveProject,
        run: deps.saveProject,
    },
    {
        id: "workspace::CloseProject",
        label: m.menubar_close_project(),
        scope: "project",
        isEnabled: (context) => context.hasActiveProject,
        run: deps.closeProject,
    },
    {
        id: "workspace::ExportSvg",
        label: m.menubar_export(),
        scope: "project",
        isEnabled: (context) => context.hasActiveProject,
        run: () => deps.exportDocument("pdf"),
    },
];
