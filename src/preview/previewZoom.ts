export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 3;
export const PREVIEW_ZOOM_STEP = 0.1;
export const PREVIEW_ZOOM_DEFAULT = 1;

export const PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS = 120;
export const PREVIEW_ZOOM_RENDER_DEBOUNCE_MIN_MS = 0;
export const PREVIEW_ZOOM_RENDER_DEBOUNCE_MAX_MS = 500;

/** @deprecated Use PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS */
export const PREVIEW_ZOOM_RENDER_DEBOUNCE_MS =
    PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS;

export function resolvePreviewZoomRenderDebounceMs(
    value: number | null | undefined,
): number {
    const ms = value ?? PREVIEW_ZOOM_RENDER_DEBOUNCE_DEFAULT_MS;
    return Math.min(
        PREVIEW_ZOOM_RENDER_DEBOUNCE_MAX_MS,
        Math.max(PREVIEW_ZOOM_RENDER_DEBOUNCE_MIN_MS, Math.round(ms)),
    );
}

export function clampPreviewZoom(zoom: number): number {
    return Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, zoom));
}

export function stepPreviewZoom(current: number, direction: 1 | -1): number {
    const next =
        Math.round((current + direction * PREVIEW_ZOOM_STEP) * 100) / 100;
    return clampPreviewZoom(next);
}

export function formatPreviewZoomPercent(zoom: number): number {
    return Math.round(zoom * 100);
}
