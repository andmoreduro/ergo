/**
 * Typed payload map for actions that carry structured data.
 *
 * `ActionInvocation.payload` is `unknown | null` on the wire (generated from
 * Rust's `Option<Value>`), which forces every handler to re-parse by hand.
 * `PayloadOf<Id>` narrows it per action id so handlers can destructure the
 * payload directly instead of casting.
 *
 * Actions not listed here carry no structured payload (payload is null or
 * irrelevant) and resolve to the `unknown` fallback, preserving backwards
 * compatibility with existing handlers that ignore the payload.
 *
 * This map is the single source of truth for payload shapes — the parse
 * helpers in tableActionPayloads.ts / authorActionPayloads.ts /
 * headingInsert.ts return values typed as `PayloadOf<"editor::...">`.
 */
import type { ActionId } from "../bindings/ActionId";

/** Focus-field payload shape (mirrors FocusFieldPayload in useAppActionHandlers). */
export interface FocusFieldPayload {
    elementId: string;
    fieldId?: string | null;
    caretUtf16Offset?: number | null;
    selectionEndUtf16Offset?: number | null;
    sourceRevision?: number | null;
    anchorPageNumber?: number | null;
    forcePreviewScroll?: boolean;
}

/** Per-action payload types. Unlisted actions fall back to `unknown`. */
export interface ActionPayloadMap {
    "editor::RemoveTableRow": { rowIndex: number };
    "editor::RemoveTableColumn": { colIndex: number };
    "editor::RemoveAuthor": { index: number };
    "editor::InsertHeading": { level: number };
    "editor::FocusField": FocusFieldPayload;
    "view::SetZoomPercent": { percent: number };
    "workspace::Notify": NotifyPayload;
}

/** Toast notification payload for `workspace::Notify`. */
export interface NotifyPayload {
    message: string;
    variant?: "default" | "error";
}

/** Resolve the payload type for an action id, or `unknown` if unmapped. */
export type PayloadOf<Id extends ActionId> =
    Id extends keyof ActionPayloadMap ? ActionPayloadMap[Id] : unknown;
