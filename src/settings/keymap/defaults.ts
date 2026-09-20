import type { KeymapSettings } from "../../bindings/KeymapSettings";
import type {
    ActionId,
    CommandScope,
    KeyBinding,
    KeymapProfile,
} from "../../commands/types";
import { normalizeKeymapSettings } from "./profiles";

const MODIFIER_PREFIX = /^(Ctrl|Shift|Alt|Meta)\+/;

const chordStroke = (chord: string) => {
    let rest = chord;
    const modifiers: string[] = [];
    let match = rest.match(MODIFIER_PREFIX);
    while (match) {
        modifiers.push(match[1] === "Ctrl" ? "Control" : match[1]!);
        rest = rest.slice(match[0].length);
        match = rest.match(MODIFIER_PREFIX);
    }
    return { key: rest.toLowerCase(), modifiers };
};

const sequence = (keys: string) =>
    keys.split(/\s+/).flatMap((chord) => (chord ? [chordStroke(chord)] : []));

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

/** Table row/column and cell navigation shortcuts. */
const BODY_OR_TABLE_CELL = "body || tableCell";

const tableCellForbiddenBindings = (
    commandId: ActionId,
    keys: string,
): KeyBinding[] => [
    defaultBinding(commandId, keys, "editor", TABLE_CELL),
];

/**
 * Frontend fallback for the pre-IPC boot window (and IPC failure), mirroring
 * the Rust-owned default keymap in `src-tauri/defaults/default_keymap.json`.
 * Rust is the source of truth: keep both sides identical —
 * `keymap.test.ts` asserts alignment, so drift fails the suite instead of
 * shipping divergent default shortcuts.
 */
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
        defaultBinding(
            "editor::OpenElementSettings",
            "Ctrl+,",
            "editor",
            "element || inlineElement",
        ),
        defaultBinding("editor::Find", "Ctrl+F", "project", "workspace || editor || body || tableCell || input"),
        defaultBinding(
            "editor::FindNext",
            "F3",
            "project",
            "workspace || editor || body || tableCell || input",
        ),
        defaultBinding(
            "editor::FindPrevious",
            "Shift+F3",
            "project",
            "workspace || editor || body || tableCell || input",
        ),
        defaultBinding("view::ZoomIn", "Ctrl+=", "global", "workspace"),
        defaultBinding("view::ZoomIn", "Ctrl+Shift+=", "global", "workspace"),
        defaultBinding("view::ZoomIn", "Ctrl++", "global", "workspace"),
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
        defaultBinding("edit::Redo", "Ctrl+Y", "project", "body"),
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
            "editor::MoveTableCellLeft",
            "Alt+ArrowLeft",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::MoveTableCellRight",
            "Alt+ArrowRight",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::MoveTableCellUp",
            "Alt+ArrowUp",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::MoveTableCellDown",
            "Alt+ArrowDown",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::AddTableRow",
            "Ctrl+Alt+Shift+R",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::AddTableColumn",
            "Ctrl+Alt+Shift+C",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::RemoveTableRow",
            "Ctrl+Alt+R",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::RemoveTableColumn",
            "Ctrl+Alt+C",
            "editor",
            BODY_OR_TABLE_CELL,
        ),
        defaultBinding(
            "editor::MergeTableCells",
            "Ctrl+Shift+M",
            "editor",
            TABLE_CELL,
        ),
        defaultBinding(
            "editor::SplitTableCell",
            "Ctrl+Shift+S",
            "editor",
            TABLE_CELL,
        ),
        defaultBinding("editor::EnterTable", "Ctrl+Enter", "editor", "body"),
        defaultBinding("editor::Tab", "Tab", "editor", "body"),
        defaultBinding("editor::Tab", "Ctrl+Shift+Tab", "editor", "body"),
        defaultBinding("editor::Tab", "Ctrl+Shift+Tab", "editor", "editor"),
        defaultBinding("editor::Tab", "Ctrl+Tab", "editor", "editor && input"),
    ],
};

/**
 * Pre-IPC boot fallback for keymap settings; the bundled bindings arrive from
 * `src-tauri/defaults/default_keymap.json` through `load_keymap_settings`.
 */
export const DEFAULT_KEYMAP_SETTINGS: KeymapSettings = normalizeKeymapSettings({
    keymap_profile: "Default",
    keymap_bindings: [],
    keymap_overrides: [],
    active_profile_id: "default",
    profiles: [],
});

export const mergeKeymapSettings = (
    settings: Partial<KeymapSettings> | null | undefined,
): KeymapSettings =>
    normalizeKeymapSettings({
        ...DEFAULT_KEYMAP_SETTINGS,
        ...(settings ?? {}),
        keymap_bindings: settings?.keymap_bindings ?? [],
        keymap_overrides: settings?.keymap_overrides ?? [],
        active_profile_id:
            settings?.active_profile_id ?? DEFAULT_KEYMAP_SETTINGS.active_profile_id,
        profiles: settings?.profiles ?? [],
    });
