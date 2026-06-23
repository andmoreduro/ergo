/**
 * Shared parsers for table editor action payloads.
 *
 * Several actions (`editor::RemoveTableRow`, `editor::RemoveTableColumn`) are
 * dispatched from more than one focused context (the element editor and the
 * body editor shell), and each carried a verbatim copy of the same payload
 * parse. Centralizing it here is the seed of the typed ActionPayload map
 * (see Wave 2): callers narrow `unknown` once and apply a context-specific
 * fallback.
 */
import type { ActionInvocation } from "../bindings/ActionInvocation";

/** Read `{ rowIndex: number }` from an action payload, or null if absent/invalid. */
export const parseRemoveTableRowPayload = (
    payload: ActionInvocation["payload"],
): number | null => {
    if (
        typeof payload === "object" &&
        payload !== null &&
        "rowIndex" in payload &&
        typeof payload.rowIndex === "number"
    ) {
        return payload.rowIndex;
    }
    return null;
};

/** Read `{ colIndex: number }` from an action payload, or null if absent/invalid. */
export const parseRemoveTableColumnPayload = (
    payload: ActionInvocation["payload"],
): number | null => {
    if (
        typeof payload === "object" &&
        payload !== null &&
        "colIndex" in payload &&
        typeof payload.colIndex === "number"
    ) {
        return payload.colIndex;
    }
    return null;
};
