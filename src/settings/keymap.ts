import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { KeyStroke } from "../bindings/KeyStroke";
import {
    DEFAULT_KEYMAP,
    detectKeymapConflicts,
    type KeymapConflict,
} from "../commands/keymap";
import type { ActionId, CommandScope, KeyBinding, KeymapProfile } from "../commands/types";

export const isCommandScope = (value: string): value is CommandScope =>
    value === "global" || value === "project" || value === "editor";

const normalizeActionId = (value: string): ActionId | null => {
    const actionId = value.trim();
    return actionId.length > 0 ? (actionId as ActionId) : null;
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

export const lookupActionShortcut = (
    keymap: KeymapProfile,
    actionId: ActionId,
    preferredContext?: string,
): string | null => {
    const bindings = keymap.bindings.filter(
        (binding) => binding.commandId === actionId && binding.keys.trim() !== "",
    );
    if (bindings.length === 0) {
        return null;
    }
    if (preferredContext) {
        const preferred = bindings.find(
            (binding) => binding.context === preferredContext,
        );
        if (preferred) {
            return preferred.keys;
        }
    }
    return bindings[0]?.keys ?? null;
};

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
        context?: string;
        sequence?: KeyStroke[];
    }): KeyBinding[] => {
        const commandId = normalizeActionId(binding.action_id ?? "");
        const context = binding.context?.trim();
        const sequence = binding.sequence ?? [];

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
