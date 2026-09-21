import type { ActionDescriptor } from "../../bindings/ActionDescriptor";
import type { KeyStroke } from "../../bindings/KeyStroke";
import type { ActionId } from "../../commands/types";
import type { KeymapProfile } from "../../commands/types";
import { bindingIdentity, formatKeySequence } from "./profile";

export interface KeymapSettingRow {
    actionId: ActionId;
    labelKey: string;
    descriptionKey: string;
    category: string;
    context: string;
    /** Binding payload (e.g. heading level); part of the row's identity. */
    payload: unknown;
    /** Every effective alternative for this identity (bundled order). */
    sequences: KeyStroke[][];
    /** First alternative, for callers that need a single sequence. */
    sequence: KeyStroke[];
    /** All alternatives formatted, joined for display; "" when unbound. */
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

export const KEY_ALTERNATIVE_SEPARATOR = " / ";

export const buildKeymapSettingRows = (
    catalog: ActionDescriptor[],
    keymap: KeymapProfile,
): KeymapSettingRow[] => {
    const catalogById = new Map(catalog.map((action) => [action.id, action]));
    const rows = new Map<string, KeymapSettingRow>();

    // One row per binding identity, alternatives folded into it.
    for (const binding of keymap.bindings) {
        const identity = bindingIdentity(binding.commandId, binding.context, binding.payload);
        const existing = rows.get(identity);
        if (existing) {
            existing.sequences.push(binding.sequence);
            existing.keys = existing.sequences
                .map(formatKeySequence)
                .join(KEY_ALTERNATIVE_SEPARATOR);
            continue;
        }
        const action = catalogById.get(binding.commandId);
        rows.set(identity, {
            actionId: binding.commandId,
            labelKey: action?.label_key ?? binding.commandId,
            descriptionKey:
                action?.description_key ?? `${binding.commandId}_description`,
            category: action?.category ?? "editor",
            context: binding.context,
            payload: binding.payload ?? null,
            sequences: [binding.sequence],
            sequence: binding.sequence,
            keys: formatKeySequence(binding.sequence),
            allowsKeybinding: action?.allows_keybinding ?? true,
            requiresProject: action?.requires_project ?? false,
        });
    }

    // Bindable actions with no binding at all in their default context get an
    // empty row there, so they can be bound from the settings.
    for (const action of catalog) {
        if (!action.allows_keybinding) {
            continue;
        }
        const boundInDefault = keymap.bindings.some(
            (binding) =>
                binding.commandId === action.id &&
                binding.context === action.default_context,
        );
        if (boundInDefault) {
            continue;
        }
        const identity = bindingIdentity(action.id, action.default_context, null);
        if (rows.has(identity)) {
            continue;
        }
        rows.set(identity, {
            actionId: action.id as ActionId,
            labelKey: action.label_key,
            descriptionKey: action.description_key,
            category: action.category,
            context: action.default_context,
            payload: null,
            sequences: [],
            sequence: [],
            keys: "",
            allowsKeybinding: action.allows_keybinding,
            requiresProject: action.requires_project,
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

        const byLabel = left.labelKey.localeCompare(right.labelKey);
        if (byLabel !== 0) {
            return byLabel;
        }
        const byContext = left.context.localeCompare(right.context);
        if (byContext !== 0) {
            return byContext;
        }
        return formatPayloadSummary(left.payload).localeCompare(
            formatPayloadSummary(right.payload),
        );
    });
};

/** Short human-readable payload ("level 2"), empty for no payload. */
export const formatPayloadSummary = (payload: unknown): string => {
    if (payload === null || payload === undefined) {
        return "";
    }
    if (typeof payload !== "object") {
        return String(payload);
    }
    return Object.entries(payload as Record<string, unknown>)
        .map(([key, value]) => `${key} ${String(value)}`)
        .join(", ");
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
    bindingIdentity(row.actionId, row.context, row.payload);

export const rowHasConflict = (
    row: KeymapSettingRow,
    conflicts: Array<{
        action_id?: string;
        conflicting_action_id?: string;
        context?: string;
    }>,
): boolean =>
    conflicts.some(
        (conflict) =>
            (conflict.action_id === row.actionId &&
                conflict.context === row.context) ||
            conflict.conflicting_action_id === row.actionId,
    );

export const formatRecordedSequence = (sequence: KeyStroke[]): string =>
    sequence.length > 0 ? formatKeySequence(sequence) : "";
