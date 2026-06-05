import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import type { KeyStroke } from "../bindings/KeyStroke";
import type { ActionId } from "../commands/types";
import type { KeymapProfile } from "../commands/types";
import { formatKeySequence } from "./keymap";

export interface KeymapSettingRow {
    actionId: ActionId;
    labelKey: string;
    descriptionKey: string;
    category: string;
    context: string;
    sequence: KeyStroke[];
    keys: string;
    allowsKeybinding: boolean;
    requiresProject: boolean;
}

const CATEGORY_ORDER = [
    "workspace",
    "edit",
    "editor",
    "bibliography",
    "view",
    "theme",
    "settings",
    "help",
];

export const buildKeymapSettingRows = (
    catalog: ActionDescriptor[],
    keymap: KeymapProfile,
): KeymapSettingRow[] => {
    const catalogById = new Map(catalog.map((action) => [action.id, action]));
    const bindingByKey = new Map(
        keymap.bindings.map((binding) => [
            `${binding.commandId}:${binding.context}`,
            binding,
        ]),
    );
    const rows = new Map<string, KeymapSettingRow>();

    for (const action of catalog) {
        if (!action.allows_keybinding) {
            continue;
        }

        const binding = bindingByKey.get(`${action.id}:${action.default_context}`);
        rows.set(`${action.id}:${action.default_context}`, {
            actionId: action.id as ActionId,
            labelKey: action.label_key,
            descriptionKey: action.description_key,
            category: action.category,
            context: action.default_context,
            sequence: binding?.sequence ?? [],
            keys: binding?.keys ?? "",
            allowsKeybinding: action.allows_keybinding,
            requiresProject: action.requires_project,
        });
    }

    for (const binding of keymap.bindings) {
        const key = `${binding.commandId}:${binding.context}`;
        if (rows.has(key)) {
            continue;
        }

        const action = catalogById.get(binding.commandId);
        rows.set(key, {
            actionId: binding.commandId,
            labelKey: action?.label_key ?? binding.commandId,
            descriptionKey:
                action?.description_key ?? `${binding.commandId}_description`,
            category: action?.category ?? "editor",
            context: binding.context,
            sequence: binding.sequence ?? [],
            keys: binding.keys,
            allowsKeybinding: action?.allows_keybinding ?? true,
            requiresProject: action?.requires_project ?? false,
        });
    }

    return [...rows.values()].toSorted((left, right) => {
        const leftCategory = CATEGORY_ORDER.indexOf(left.category);
        const rightCategory = CATEGORY_ORDER.indexOf(right.category);
        const leftRank = leftCategory === -1 ? CATEGORY_ORDER.length : leftCategory;
        const rightRank =
            rightCategory === -1 ? CATEGORY_ORDER.length : rightCategory;

        if (leftRank !== rightRank) {
            return leftRank - rightRank;
        }

        return left.labelKey.localeCompare(right.labelKey);
    });
};

export const formatKeymapCategoryLabel = (category: string): string =>
    category
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (char) => char.toUpperCase());

export const groupKeymapRowsByCategory = (
    rows: KeymapSettingRow[],
): Array<{ category: string; rows: KeymapSettingRow[] }> => {
    const groups = new Map<string, KeymapSettingRow[]>();

    for (const row of rows) {
        const current = groups.get(row.category) ?? [];
        current.push(row);
        groups.set(row.category, current);
    }

    return [...groups.entries()]
        .map(([category, categoryRows]) => ({
            category,
            rows: categoryRows,
        }))
        .toSorted((left, right) => {
            const leftCategory = CATEGORY_ORDER.indexOf(left.category);
            const rightCategory = CATEGORY_ORDER.indexOf(right.category);
            const leftRank =
                leftCategory === -1 ? CATEGORY_ORDER.length : leftCategory;
            const rightRank =
                rightCategory === -1 ? CATEGORY_ORDER.length : rightCategory;
            return leftRank - rightRank;
        });
};

export const rowBindingKey = (row: KeymapSettingRow): string =>
    `${row.context}-${row.actionId}`;

export const rowHasConflict = (
    row: KeymapSettingRow,
    conflicts: Array<{
        action_id?: string;
        context?: string;
    }>,
): boolean =>
    conflicts.some(
        (conflict) =>
            conflict.action_id === row.actionId &&
            conflict.context === row.context,
    );

export const formatRecordedSequence = (sequence: KeyStroke[]): string =>
    sequence.length > 0 ? formatKeySequence(sequence) : "";
