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
