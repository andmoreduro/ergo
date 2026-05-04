import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { KeyStroke } from "../bindings/KeyStroke";
import {
    DEFAULT_KEYMAP,
    detectKeymapConflicts,
    type KeymapConflict,
} from "../commands/keymap";
import type { CommandScope, KeyBinding, KeymapProfile } from "../commands/types";
import { isCommandId, type CommandId } from "../commands/types";

export const isCommandScope = (value: string): value is CommandScope =>
    value === "global" || value === "project" || value === "editor";

const LEGACY_COMMAND_ID_ALIASES: Record<string, CommandId> = {
    "project.new": "workspace::NewProject",
    "project.open": "workspace::OpenProject",
    "project.save": "workspace::SaveProject",
    "project.close": "workspace::CloseProject",
    "project.export.svg": "workspace::ExportSvg",
    "edit.undo": "edit::Undo",
    "edit.redo": "edit::Redo",
    "edit.deleteElement": "editor::DeleteElement",
    "insert.paragraph": "editor::InsertParagraph",
    "insert.heading": "editor::InsertHeading",
    "insert.table": "editor::InsertTable",
    "insert.figure": "editor::InsertFigure",
    "insert.equation": "editor::InsertEquation",
    "insert.reference": "editor::InsertReference",
    "view.commandPalette": "view::OpenCommandPalette",
    "view.zoomIn": "view::ZoomIn",
    "view.zoomOut": "view::ZoomOut",
    "view.theme.system": "theme::UseSystem",
    "view.theme.light": "theme::UseLight",
    "view.theme.dark": "theme::UseDark",
    "settings.global": "settings::OpenGlobal",
    "settings.project": "settings::OpenProject",
    "settings.keymap": "settings::OpenKeymap",
    "help.documentation": "help::OpenDocumentation",
    "help.about": "help::OpenAbout",
};

const normalizeCommandId = (value: string): CommandId | null => {
    if (isCommandId(value)) {
        return value;
    }

    return LEGACY_COMMAND_ID_ALIASES[value] ?? null;
};

const contextToScope = (context: string): CommandScope => {
    if (context.includes("editor") || context.includes("element")) {
        return "editor";
    }

    if (context.includes("workspace")) {
        return "project";
    }

    return "global";
};

const scopeToContext = (scope: string | undefined): string | null => {
    if (scope === "global") {
        return "app";
    }

    if (scope === "project") {
        return "workspace && !input";
    }

    if (scope === "editor") {
        return "editor && !input";
    }

    return null;
};

const parseKeySequence = (keys: string): KeyStroke[] =>
    keys
        .split(/\s+/)
        .filter(Boolean)
        .map((chord) => {
            const parts = chord.split("+").filter(Boolean);
            const key = parts.pop() ?? "";
            return {
                key: key.length === 1 ? key.toLocaleLowerCase() : key.toLowerCase(),
                modifiers: parts.map((modifier) =>
                    modifier === "Ctrl" ? "Control" : modifier,
                ) as KeyStroke["modifiers"],
            };
        });

export const formatKeySequence = (sequence: KeyStroke[]): string =>
    sequence
        .map((stroke) => {
            const modifiers = stroke.modifiers.map((modifier) =>
                modifier === "Control" ? "Ctrl" : modifier,
            );
            const key =
                stroke.key.length === 1
                    ? stroke.key.toLocaleUpperCase()
                    : stroke.key;

            return [...modifiers, key].join("+");
        })
        .join(" ");

export const createKeymapProfile = (
    settings: KeymapSettings,
): {
    keymap: KeymapProfile;
    conflicts: KeymapConflict[];
} => {
    const toKeyBinding = (binding: {
        action_id?: string;
        command_id?: string;
        context?: string;
        sequence?: KeyStroke[];
        keys?: string;
        scope?: string;
    }): KeyBinding[] => {
        const commandId = normalizeCommandId(
            binding.action_id ?? binding.command_id ?? "",
        );
        const context = binding.context ?? scopeToContext(binding.scope);
        const sequence = binding.sequence ?? parseKeySequence(binding.keys ?? "");

        if (!commandId) {
            return [];
        }

        if (!context) {
            return [];
        }

        return [
            {
                commandId,
                keys: formatKeySequence(sequence),
                scope: contextToScope(context),
                context,
                sequence,
            },
        ];
    };

    const baseBindings = settings.keymap_bindings.flatMap<KeyBinding>(toKeyBinding);
    const overrides = settings.keymap_overrides.flatMap<KeyBinding>(toKeyBinding);
    const overrideMap = new Map(
        overrides.map((binding) => [
            `${binding.commandId}:${binding.context}`,
            binding,
        ]),
    );
    const mergedBindings = (
        baseBindings.length > 0 ? baseBindings : DEFAULT_KEYMAP.bindings
    ).map((binding) => {
        const key = `${binding.commandId}:${binding.context}`;
        return overrideMap.get(key) ?? binding;
    });
    const baseKeys = new Set(
        mergedBindings.map((binding) => `${binding.commandId}:${binding.context}`),
    );
    const addedOverrides = overrides.filter(
        (binding) => !baseKeys.has(`${binding.commandId}:${binding.context}`),
    );

    const keymap = {
        name: settings.keymap_profile ?? DEFAULT_KEYMAP.name,
        bindings: [...mergedBindings, ...addedOverrides],
    };

    return {
        keymap,
        conflicts: detectKeymapConflicts(keymap.bindings),
    };
};
