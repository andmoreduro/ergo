import type { KeyboardEvent } from "react";
import type { KeyStroke } from "../../../bindings/KeyStroke";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { KeyBinding } from "../../../commands/types";

export const toOptionalNumber = (value: string): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const removeKeymapOverride = (
    settings: KeymapSettings,
    binding: KeyBinding,
): KeymapSettings => ({
    ...settings,
    keymap_overrides: settings.keymap_overrides.filter(
        (override) =>
            override.action_id !== binding.commandId ||
            override.context !== binding.context,
    ),
});

export const upsertKeymapOverride = (
    settings: KeymapSettings,
    binding: KeyBinding,
    sequence: KeyStroke[],
): KeymapSettings => {
    const withoutCurrent = removeKeymapOverride(settings, binding);

    return {
        ...withoutCurrent,
        keymap_overrides: [
            ...withoutCurrent.keymap_overrides,
            {
                action_id: binding.commandId,
                context: binding.context,
                sequence,
            },
        ],
    };
};

export const strokeFromKeyboardEvent = (
    event: KeyboardEvent,
): KeyStroke | null => {
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
        return null;
    }

    const modifiers: KeyStroke["modifiers"] = [];
    if (event.ctrlKey) {
        modifiers.push("Control");
    }
    if (event.altKey) {
        modifiers.push("Alt");
    }
    if (event.shiftKey) {
        modifiers.push("Shift");
    }
    if (event.metaKey) {
        modifiers.push("Meta");
    }

    return {
        key:
            event.key.length === 1
                ? event.key.toLocaleLowerCase()
                : event.key.toLowerCase(),
        modifiers,
    };
};
