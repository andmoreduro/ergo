import type {
    CommandId,
    CommandScope,
    KeyBinding,
    KeymapProfile,
} from "./types";

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
