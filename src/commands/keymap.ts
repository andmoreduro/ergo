import type {
    CommandContext,
    CommandId,
    CommandScope,
    KeyBinding,
    KeymapProfile,
} from "./types";
import type { CommandRegistry } from "./registry";

const sequence = (keys: string) =>
    keys.split(/\s+/).flatMap((chord) => {
        if (!chord) {
            return [];
        }

        const parts = chord.split("+");
        const key = parts.pop() ?? "";
        return [
            {
                key: key.toLowerCase(),
                modifiers: parts.map((part) =>
                    part === "Ctrl" ? "Control" : part,
                ),
            },
        ];
    });

const defaultBinding = (
    commandId: CommandId,
    keys: string,
    scope: CommandScope,
    context: string,
): KeyBinding => ({
    commandId,
    keys,
    scope,
    context,
    sequence: sequence(keys) as KeyBinding["sequence"],
});

export const DEFAULT_KEYMAP: KeymapProfile = {
    name: "Default",
    bindings: [
        defaultBinding("workspace::NewProject", "Ctrl+N", "global", "app"),
        defaultBinding("workspace::OpenProject", "Ctrl+O Ctrl+O", "global", "app"),
        defaultBinding(
            "workspace::OpenRecentProject",
            "Ctrl+O Ctrl+R",
            "global",
            "app",
        ),
        defaultBinding(
            "workspace::SaveProject",
            "Ctrl+S",
            "project",
            "workspace && !input",
        ),
        defaultBinding(
            "workspace::CloseProject",
            "Ctrl+Shift+W",
            "project",
            "workspace",
        ),
        defaultBinding(
            "view::OpenCommandPalette",
            "Ctrl+Shift+P",
            "global",
            "app",
        ),
        defaultBinding("edit::Undo", "Ctrl+Z", "project", "workspace && !input"),
        defaultBinding(
            "edit::Redo",
            "Ctrl+Shift+Z",
            "project",
            "workspace && !input",
        ),
        defaultBinding(
            "editor::InsertParagraph",
            "Ctrl+Alt+P",
            "editor",
            "editor && !input",
        ),
        defaultBinding(
            "editor::InsertHeading",
            "Ctrl+Alt+H",
            "editor",
            "editor && !input",
        ),
        defaultBinding(
            "editor::InsertTable",
            "Ctrl+Alt+T",
            "editor",
            "editor && !input",
        ),
        defaultBinding(
            "editor::InsertEquation",
            "Ctrl+Alt+E",
            "editor",
            "editor && !input",
        ),
        defaultBinding(
            "editor::InsertFigure",
            "Ctrl+Alt+F",
            "editor",
            "editor && !input",
        ),
    ],
};

export interface KeymapConflict {
    keys: string;
    scope: CommandScope;
    commandIds: CommandId[];
}

const normalizeKey = (key: string): string => {
    if (key === " ") {
        return "Space";
    }

    if (key.length === 1) {
        return key.toUpperCase();
    }

    return key;
};

export const normalizeKeyChord = (event: KeyboardEvent): string => {
    const parts = [
        event.ctrlKey ? "Ctrl" : null,
        event.metaKey ? "Meta" : null,
        event.altKey ? "Alt" : null,
        event.shiftKey ? "Shift" : null,
        normalizeKey(event.key),
    ].filter(Boolean);

    return parts.join("+");
};

export const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        target.closest("input, textarea, select, [contenteditable='true']"),
    );
};

export const commandScopeMatches = (
    bindingScope: CommandScope,
    context: CommandContext,
    target: EventTarget | null,
): boolean => {
    if (bindingScope === "global") {
        return true;
    }

    if (!context.hasActiveProject) {
        return false;
    }

    if (bindingScope === "editor" && isEditableShortcutTarget(target)) {
        return false;
    }

    return true;
};

const scopeSpecificity = (scope: CommandScope): number => {
    if (scope === "editor") {
        return 2;
    }

    if (scope === "project") {
        return 1;
    }

    return 0;
};

export const findCommandForKeyboardEvent = (
    event: KeyboardEvent,
    bindings: KeyBinding[],
    registry: CommandRegistry,
    context: CommandContext,
): CommandId | null => {
    const chord = normalizeKeyChord(event);
    const matchingBindings = bindings
        .filter(
            (item) =>
                item.keys === chord &&
                commandScopeMatches(item.scope, context, event.target),
        )
        .sort((left, right) => scopeSpecificity(right.scope) - scopeSpecificity(left.scope));

    for (const binding of matchingBindings) {
        if (registry.enabled(binding.commandId, context)) {
            return binding.commandId;
        }
    }

    return null;
};

export const detectKeymapConflicts = (
    bindings: KeyBinding[],
): KeymapConflict[] => {
    const grouped = new Map<string, KeyBinding[]>();

    bindings.forEach((binding) => {
        if (binding.keys.trim() === "") {
            return;
        }

        const key = `${binding.scope}:${binding.keys}`;
        grouped.set(key, [...(grouped.get(key) ?? []), binding]);
    });

    return Array.from(grouped.entries())
        .filter(([, group]) => group.length > 1)
        .map(([, group]) => ({
            keys: group[0].keys,
            scope: group[0].scope,
            commandIds: group.map((binding) => binding.commandId),
        }));
};
