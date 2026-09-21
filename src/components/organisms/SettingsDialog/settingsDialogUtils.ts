import type { KeyStroke } from "../../../bindings/KeyStroke";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import type { KeyBinding } from "../../../commands/types";
import {
    ensureCustomProfileForEdit,
    normalizeKeymapSettings,
    updateActiveProfileOverrides,
} from "../../../settings/keymap/profiles";
import { bindingIdentity } from "../../../settings/keymap/profile";
import {
    resolveShortcutKey,
    shortcutChordModifiers,
} from "../../../editor/shortcutKeyFromKeyboardEvent";

export const toOptionalNumber = (value: string): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const sameIdentity = (
    override: { action_id: string; context: string; payload?: unknown },
    binding: { commandId: string; context: string; payload?: unknown },
): boolean =>
    bindingIdentity(override.action_id, override.context, override.payload) ===
    bindingIdentity(binding.commandId, binding.context, binding.payload);

/** Drop the user's override for this identity (back to the bundled binding). */
export const removeKeymapOverride = (
    settings: KeymapSettings,
    binding: KeyBinding,
): KeymapSettings => {
    const normalized = normalizeKeymapSettings(settings);
    const nextOverrides = normalized.keymap_overrides.filter(
        (override) => !sameIdentity(override, binding),
    );

    return updateActiveProfileOverrides(normalized, nextOverrides);
};

/** Bind this identity to `sequence`, replacing every bundled alternative. */
export const upsertKeymapOverride = (
    settings: KeymapSettings,
    binding: KeyBinding,
    sequence: KeyStroke[],
): KeymapSettings => {
    const withCustomProfile = ensureCustomProfileForEdit(settings);
    const withoutCurrent = removeKeymapOverride(withCustomProfile, binding);

    return updateActiveProfileOverrides(withoutCurrent, [
        ...withoutCurrent.keymap_overrides,
        {
            action_id: binding.commandId,
            context: binding.context,
            sequence,
            payload: binding.payload ?? null,
        },
    ]);
};

/** Unbind this identity (an override with an empty sequence hides bundled alternatives). */
export const unbindKeymapIdentity = (
    settings: KeymapSettings,
    binding: KeyBinding,
): KeymapSettings => upsertKeymapOverride(settings, binding, []);

export const hasKeymapOverride = (
    settings: KeymapSettings,
    binding: { commandId: string; context: string; payload?: unknown },
): boolean =>
    normalizeKeymapSettings(settings).keymap_overrides.some((override) =>
        sameIdentity(override, binding),
    );

/**
 * The stroke a keydown represents, spelled exactly as the action runtime sends
 * it to the Rust resolver (physical key for Ctrl+Alt / AltGr chords), so a
 * recorded binding matches the keys that later trigger it.
 */
export const strokeFromKeyboardEvent = (
    event: Pick<
        globalThis.KeyboardEvent,
        "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "getModifierState"
    >,
): KeyStroke | null => {
    if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(event.key)) {
        return null;
    }

    return {
        key: resolveShortcutKey(event),
        modifiers: shortcutChordModifiers(event),
    };
};
