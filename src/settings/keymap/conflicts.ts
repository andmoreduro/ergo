import type { ActionId, CommandScope, KeyBinding } from "../../commands/types";

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

