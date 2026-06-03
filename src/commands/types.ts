import type { ActionId } from "../bindings/ActionId";
import type { KeyStroke } from "../bindings/KeyStroke";

export type { ActionId };

export type CommandScope = "global" | "project" | "editor";

export interface CommandContext {
    hasActiveProject: boolean;
    focusedElementId: string | null;
}

export interface Command {
    id: ActionId;
    label: string;
    scope: CommandScope;
    run: () => void | Promise<void>;
    isEnabled?: (context: CommandContext) => boolean;
}

export interface KeyBinding {
    commandId: ActionId;
    keys: string;
    scope: CommandScope;
    context: string;
    sequence: KeyStroke[];
    payload?: unknown;
}

export interface KeymapProfile {
    name: string;
    bindings: KeyBinding[];
}
