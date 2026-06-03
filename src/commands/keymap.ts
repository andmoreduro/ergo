import type {
    ActionId,
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
    commandId: ActionId,
    keys: string,
    scope: CommandScope,
    context: string,
    payload?: unknown,
): KeyBinding => ({
    commandId,
    keys,
    scope,
    context,
    sequence: sequence(keys) as KeyBinding["sequence"],
    ...(payload === undefined ? {} : { payload }),
});

const insertHeadingLevelBindings = (level: number): KeyBinding[] => {
    // Ctrl+Alt+1..5 are often captured by the OS/desktop; Shift avoids that.
    const keys = `Ctrl+Alt+Shift+${level}`;
    const payload = { level };
    return [
        defaultBinding(
            "editor::InsertHeading",
            keys,
            "editor",
            EDITOR_OUTSIDE_TABLE_CELL,
            payload,
        ),
        ...tableCellForbiddenBindings("editor::InsertHeading", keys),
    ];
};

/** ProseMirror body and table cells (not template `input` fields). */
const EDITOR_BODY = "editor";

/** Section-level inserts blocked inside table cells. */
const EDITOR_OUTSIDE_TABLE_CELL = "editor && !tableCell";

/** Swallow toolbar-locked shortcuts while editing a cell. */
const TABLE_CELL = "tableCell";

const tableCellForbiddenBindings = (
    commandId: ActionId,
    keys: string,
): KeyBinding[] => [
    defaultBinding(commandId, keys, "editor", TABLE_CELL),
];

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
        defaultBinding("view::ZoomIn", "Ctrl+=", "global", "workspace"),
        defaultBinding("view::ZoomOut", "Ctrl+-", "global", "workspace"),
        defaultBinding(
            "edit::Undo",
            "Ctrl+Z",
            "project",
            "workspace || editor || body",
        ),
        defaultBinding(
            "edit::Redo",
            "Ctrl+Shift+Z",
            "project",
            "workspace || editor || body",
        ),
        defaultBinding(
            "editor::InsertParagraph",
            "Ctrl+Alt+P",
            "editor",
            EDITOR_BODY,
        ),
        ...([1, 2, 3, 4, 5, 6] as const).flatMap(insertHeadingLevelBindings),
        defaultBinding(
            "editor::InsertTable",
            "Ctrl+Alt+T",
            "editor",
            EDITOR_OUTSIDE_TABLE_CELL,
        ),
        ...tableCellForbiddenBindings("editor::InsertTable", "Ctrl+Alt+T"),
        defaultBinding(
            "editor::InsertEquation",
            "Ctrl+Alt+E",
            "editor",
            EDITOR_BODY,
        ),
        defaultBinding(
            "editor::InsertBlockEquation",
            "Ctrl+Alt+E",
            "editor",
            EDITOR_BODY,
        ),
        defaultBinding(
            "editor::InsertFigure",
            "Ctrl+Alt+F",
            "editor",
            EDITOR_OUTSIDE_TABLE_CELL,
        ),
        ...tableCellForbiddenBindings("editor::InsertFigure", "Ctrl+Alt+F"),
        defaultBinding(
            "editor::InsertQuote",
            "Ctrl+Alt+Q",
            "editor",
            EDITOR_BODY,
        ),
        defaultBinding(
            "editor::InsertDiagram",
            "Ctrl+Alt+D",
            "editor",
            EDITOR_OUTSIDE_TABLE_CELL,
        ),
        ...tableCellForbiddenBindings("editor::InsertDiagram", "Ctrl+Alt+D"),
        defaultBinding(
            "editor::InsertList",
            "Ctrl+Alt+L",
            "editor",
            EDITOR_BODY,
        ),
        defaultBinding(
            "editor::InsertEnumeration",
            "Ctrl+Alt+U",
            "editor",
            EDITOR_BODY,
        ),
        defaultBinding(
            "editor::InsertInlineEquation",
            "Ctrl+Alt+I",
            "editor",
            EDITOR_BODY,
        ),
        defaultBinding(
            "editor::InsertReference",
            "Ctrl+Alt+Shift+R",
            "editor",
            EDITOR_BODY,
        ),
        defaultBinding(
            "editor::Bold",
            "Ctrl+B",
            "editor",
            "editor || input",
        ),
        defaultBinding(
            "editor::Italic",
            "Ctrl+I",
            "editor",
            "editor || input",
        ),
        defaultBinding(
            "editor::Underline",
            "Ctrl+U",
            "editor",
            "editor || input",
        ),
        defaultBinding(
            "editor::ConvertToParagraph",
            "Ctrl+Alt+1",
            "editor",
            "element && !input",
        ),
        defaultBinding(
            "editor::ConvertToHeading",
            "Ctrl+Alt+2",
            "editor",
            "element && !input",
        ),
        defaultBinding(
            "editor::ConvertToTable",
            "Ctrl+Alt+3",
            "editor",
            "element && !input",
        ),
        defaultBinding(
            "editor::ConvertToEquation",
            "Ctrl+Alt+4",
            "editor",
            "element && !input",
        ),
        defaultBinding(
            "editor::ConvertToFigure",
            "Ctrl+Alt+5",
            "editor",
            "element && !input",
        ),
    ],
};

export interface KeymapConflict {
    keys: string;
    scope: CommandScope;
    commandIds: ActionId[];
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

