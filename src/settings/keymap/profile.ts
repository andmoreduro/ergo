import type { KeymapSettings } from "../../bindings/KeymapSettings";
import type { KeyStroke } from "../../bindings/KeyStroke";
import { DEFAULT_KEYMAP } from "./defaults";
import { detectKeymapConflicts, type KeymapConflict } from "./conflicts";
import type { ActionId, CommandScope, KeyBinding, KeymapProfile } from "../../commands/types";

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

const NAMED_KEY_LABELS: Record<string, string> = {
    arrowup: "Up",
    arrowdown: "Down",
    arrowleft: "Left",
    arrowright: "Right",
    enter: "Enter",
    tab: "Tab",
    escape: "Esc",
    backspace: "Backspace",
    delete: "Del",
    space: "Space",
};

/** Display label for a normalized key name ("f9" → "F9", "arrowup" → "Up"). */
export const formatKeyLabel = (key: string): string => {
    if (key.length === 1) {
        return key.toLocaleUpperCase();
    }
    if (/^f\d{1,2}$/.test(key)) {
        return key.toUpperCase();
    }
    return NAMED_KEY_LABELS[key] ?? key;
};

export const formatKeySequence = (sequence: KeyStroke[]): string =>
    sequence
        .map((stroke) => {
            const modifiers = stroke.modifiers.map((modifier) =>
                modifier === "Control" ? "Ctrl" : modifier,
            );
            return [...modifiers, formatKeyLabel(stroke.key)].join("+");
        })
        .join(" ");

/** Canonical JSON (sorted keys) so equal payloads always spell the same identity. */
const canonicalPayload = (payload: unknown): string => {
    if (payload === null || payload === undefined) {
        return "";
    }
    const sortKeys = (value: unknown): unknown => {
        if (Array.isArray(value)) {
            return value.map(sortKeys);
        }
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.keys(value as Record<string, unknown>)
                    .sort()
                    .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
            );
        }
        return value;
    };
    return JSON.stringify(sortKeys(payload));
};

/**
 * A binding's customization identity: action + context expression + payload.
 * Mirrors `binding_identity` in `src-tauri/src/action_keymap.rs`: bundled
 * bindings sharing an identity are alternatives; a user override replaces all
 * of them and an empty override unbinds the identity.
 */
export const bindingIdentity = (
    commandId: string,
    context: string,
    payload?: unknown,
): string => `${commandId}\u001f${context}\u001f${canonicalPayload(payload)}`;

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
        payload?: unknown;
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
                payload: binding.payload ?? null,
            },
        ];
    };

    const baseBindings = settings.keymap_bindings.flatMap<KeyBinding>(toKeyBinding);
    const overrides = settings.keymap_overrides.flatMap<KeyBinding>(toKeyBinding);
    const base = baseBindings.length > 0 ? baseBindings : DEFAULT_KEYMAP.bindings;

    // Ordered identity groups (bundled order first, new overrides appended).
    const order: string[] = [];
    const groups = new Map<string, KeyBinding[]>();
    for (const binding of base) {
        const identity = bindingIdentity(binding.commandId, binding.context, binding.payload);
        if (!groups.has(identity)) {
            order.push(identity);
            groups.set(identity, []);
        }
        groups.get(identity)!.push(binding);
    }
    for (const binding of overrides) {
        const identity = bindingIdentity(binding.commandId, binding.context, binding.payload);
        if (binding.sequence.length === 0) {
            groups.delete(identity);
            continue;
        }
        if (!groups.has(identity)) {
            order.push(identity);
        }
        groups.set(identity, [binding]);
    }

    const keymap = {
        name: settings.keymap_profile ?? DEFAULT_KEYMAP.name,
        bindings: order.flatMap((identity) => groups.get(identity) ?? []),
    };

    return {
        keymap,
        conflicts: detectKeymapConflicts(keymap.bindings),
    };
};
