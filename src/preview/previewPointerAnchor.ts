import { clientPointInsideElement } from "./previewZoomInput";

let lastPointer: { x: number; y: number } | null = null;
let pointerInsidePreviewColumn = false;

export function updatePreviewPointerAnchor(
    clientX: number,
    clientY: number,
    insidePreviewColumn: boolean,
): void {
    lastPointer = { x: clientX, y: clientY };
    pointerInsidePreviewColumn = insidePreviewColumn;
}

export function clearPreviewPointerAnchor(): void {
    lastPointer = null;
    pointerInsidePreviewColumn = false;
}

/**
 * Zoom anchor for the preview scroll viewport: last mouse position when the
 * pointer is over the preview column, otherwise the viewport center.
 */
export function resolvePreviewZoomAnchor(
    scrollRoot: HTMLElement,
    previewColumn?: HTMLElement | null,
): { x: number; y: number } {
    const scrollRect = scrollRoot.getBoundingClientRect();
    const column = previewColumn ?? scrollRoot;

    if (
        pointerInsidePreviewColumn &&
        lastPointer &&
        clientPointInsideElement(column, lastPointer.x, lastPointer.y)
    ) {
        if (clientPointInsideElement(scrollRoot, lastPointer.x, lastPointer.y)) {
            return { x: lastPointer.x, y: lastPointer.y };
        }
        return {
            x: lastPointer.x,
            y: scrollRect.top + scrollRect.height * 0.5,
        };
    }

    return {
        x: scrollRect.left + scrollRect.width * 0.5,
        y: scrollRect.top + scrollRect.height * 0.5,
    };
}
