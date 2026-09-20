/**
 * Shared parsers for table editor action payloads.
 *
 * Several actions (`editor::RemoveTableRow`, `editor::RemoveTableColumn`) are
 * dispatched from more than one focused context (the element editor and the
 * body editor shell). The payload shapes are declared in
 * `commands/actionPayloads.ts` (`PayloadOf<"editor::RemoveTableRow">`); these
 * helpers validate `unknown` at runtime and return the field value (or null).
 */
import type { ActionInvocation } from "../bindings/ActionInvocation";
import { numericPayloadField } from "../commands/actionPayloads";

/** Read `{ rowIndex: number }` from an action payload, or null if absent/invalid. */
export const parseRemoveTableRowPayload = (
    payload: ActionInvocation["payload"],
): number | null => numericPayloadField(payload, "rowIndex");

/** Read `{ colIndex: number }` from an action payload, or null if absent/invalid. */
export const parseRemoveTableColumnPayload = (
    payload: ActionInvocation["payload"],
): number | null => numericPayloadField(payload, "colIndex");
