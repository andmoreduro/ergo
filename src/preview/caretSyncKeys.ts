import type { DocumentFocusState } from "../state/DocumentContext";
import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";

/**
 * Dedupes caret worker lookups. Native typing no longer bumps focus on every
 * keystroke, so the key tracks field identity + compile revision + focus
 * request id (focus / select / click). Preview-driven focus keeps per-offset
 * precision.
 */
export function caretFetchKey(
    previewRevision: number,
    target: Pick<
        PreviewFocusTarget,
        "elementId" | "fieldId" | "caretUtf16Offset"
    >,
    documentFocus: Pick<
        DocumentFocusState,
        "focusSource" | "forcePreviewScroll" | "requestId"
    >,
): string {
    const fieldPart = `${target.elementId}:${target.fieldId ?? ""}`;
    if (
        documentFocus.forcePreviewScroll ||
        documentFocus.focusSource === "preview"
    ) {
        return `${previewRevision}:${fieldPart}:${target.caretUtf16Offset ?? ""}`;
    }
    return `${previewRevision}:${fieldPart}:${documentFocus.requestId}`;
}
