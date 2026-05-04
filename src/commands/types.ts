import type { ActionId } from "../bindings/ActionId";
import type { KeyStroke } from "../bindings/KeyStroke";

export type { ActionId };

export type CommandId = ActionId;

export const COMMAND_IDS: CommandId[] = [
    "workspace::NewProject",
    "workspace::OpenProject",
    "workspace::OpenRecentProject",
    "workspace::SaveProject",
    "workspace::CloseProject",
    "workspace::ExportSvg",
    "edit::Undo",
    "edit::Redo",
    "editor::DeleteElement",
    "editor::InsertParagraph",
    "editor::InsertHeading",
    "editor::InsertTable",
    "editor::InsertFigure",
    "editor::InsertEquation",
    "editor::InsertReference",
    "editor::AddAuthor",
    "editor::RemoveAuthor",
    "editor::AddTableRow",
    "editor::AddTableColumn",
    "editor::RemoveTableRow",
    "editor::RemoveTableColumn",
    "view::OpenCommandPalette",
    "view::ZoomIn",
    "view::ZoomOut",
    "theme::UseSystem",
    "theme::UseLight",
    "theme::UseDark",
    "settings::OpenGlobal",
    "settings::OpenProject",
    "settings::OpenKeymap",
    "settings::Close",
    "help::OpenDocumentation",
    "help::OpenAbout",
];

export const isCommandId = (value: string): value is CommandId =>
    COMMAND_IDS.includes(value as CommandId);

export type CommandScope = "global" | "project" | "editor";

export interface CommandContext {
    hasActiveProject: boolean;
    focusedElementId: string | null;
}

export interface Command {
    id: CommandId;
    label: string;
    scope: CommandScope;
    run: () => void | Promise<void>;
    isEnabled?: (context: CommandContext) => boolean;
}

export interface KeyBinding {
    commandId: CommandId;
    keys: string;
    scope: CommandScope;
    context: string;
    sequence: KeyStroke[];
}

export interface KeymapProfile {
    name: string;
    bindings: KeyBinding[];
}
