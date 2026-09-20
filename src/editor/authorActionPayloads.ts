import type { ActionInvocation } from "../bindings/ActionInvocation";
import { numericPayloadField } from "../commands/actionPayloads";

/**
 * Read `{ index: number }` from an `editor::RemoveAuthor` payload, or null if
 * absent/invalid. When the action is triggered from the keyboard (Delete on a
 * focused author) the payload carries the focused index; when no payload is
 * present the caller falls back to the focused-author heuristic.
 */
export const parseRemoveAuthorPayload = (
    payload: ActionInvocation["payload"],
): number | null => numericPayloadField(payload, "index");
