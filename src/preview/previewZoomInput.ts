import { clampPreviewZoom } from "./previewZoom";

/** Converts wheel delta to pixel-like units for a consistent zoom curve. */
export function normalizeWheelDeltaY(deltaY: number, deltaMode: number): number {
    switch (deltaMode) {
        case 1:
            return deltaY * 16;
        case 2:
            return deltaY * (typeof window !== "undefined" ? window.innerHeight * 0.5 : 400);
        default:
            return deltaY;
    }
}

const WHEEL_ZOOM_EXP_FACTOR = 0.0015;

/** Continuous zoom from ctrl/meta + wheel (trackpad pinch uses the same path). */
export function zoomFromWheelDelta(
    current: number,
    deltaY: number,
    deltaMode = 0,
): number {
    const pixels = normalizeWheelDeltaY(deltaY, deltaMode);
    if (pixels === 0) {
        return current;
    }
    return clampPreviewZoom(current * Math.exp(-pixels * WHEEL_ZOOM_EXP_FACTOR));
}

/** Continuous zoom from a multiplicative pinch scale (1 = no change). */
export function zoomFromPinchScale(current: number, scale: number): number {
    if (!Number.isFinite(scale) || scale <= 0) {
        return current;
    }
    return clampPreviewZoom(current * scale);
}

export function pointerDistance(
    a: { x: number; y: number },
    b: { x: number; y: number },
): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
}

/** Center of the sync caret when it intersects the preview scroll viewport. */
export function syncCaretAnchorInPreviewViewport(
    scrollRoot: HTMLElement,
): { x: number; y: number } | null {
    const caret = scrollRoot.querySelector<HTMLElement>(
        '[data-preview-sync-caret="true"]',
    );
    if (!caret) {
        return null;
    }

    const caretRect = caret.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    const centerX = (caretRect.left + caretRect.right) * 0.5;
    const centerY = (caretRect.top + caretRect.bottom) * 0.5;

    if (
        centerX < rootRect.left ||
        centerX > rootRect.right ||
        centerY < rootRect.top ||
        centerY > rootRect.bottom
    ) {
        return null;
    }

    return { x: centerX, y: centerY };
}

export function clientPointInsideElement(
    element: HTMLElement,
    clientX: number,
    clientY: number,
): boolean {
    const rect = element.getBoundingClientRect();
    return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
    );
}

/** Keep a viewport point fixed on content while zoom changes. */
export function preservePreviewScrollAtClientPoint(
    scrollRoot: HTMLElement,
    oldZoom: number,
    newZoom: number,
    clientX: number,
    clientY: number,
): void {
    if (oldZoom <= 0 || newZoom <= 0 || oldZoom === newZoom) {
        return;
    }

    const rootRect = scrollRoot.getBoundingClientRect();
    const offsetX = clientX - rootRect.left + scrollRoot.scrollLeft;
    const offsetY = clientY - rootRect.top + scrollRoot.scrollTop;
    const scale = newZoom / oldZoom;

    scrollRoot.scrollLeft = Math.max(
        0,
        offsetX * scale - (clientX - rootRect.left),
    );
    scrollRoot.scrollTop = Math.max(
        0,
        offsetY * scale - (clientY - rootRect.top),
    );
}
