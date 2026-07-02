/**
 * Position and size a band canvas inside its page surface.
 *
 * The preview rasterizes only the visible vertical slice of each page ("band")
 * onto a canvas that is absolutely positioned within the page surface. Every
 * site that draws or restyles a band recomputes the same CSS-per-pt scale from
 * the page geometry and applies the same left/top/width/height transform.
 *
 * This helper centralizes that mapping. It returns the per-pt scales so callers
 * that need them for backing-store sizing (the blit path) don't recompute.
 */
export function layoutBandCanvas(
    canvas: HTMLCanvasElement,
    band: {
        xMinPt: number;
        xMaxPt: number;
        yMinPt: number;
        yMaxPt: number;
    },
    geometry: {
        cssWidth: number;
        cssHeight: number;
        pageWidthPt: number;
        pageHeightPt: number;
    },
): { perPtX: number; perPtY: number } {
    const perPtX =
        geometry.pageWidthPt > 0
            ? geometry.cssWidth / geometry.pageWidthPt
            : 0;
    const perPtY =
        geometry.pageHeightPt > 0
            ? geometry.cssHeight / geometry.pageHeightPt
            : 0;
    canvas.style.left = `${band.xMinPt * perPtX}px`;
    canvas.style.top = `${band.yMinPt * perPtY}px`;
    canvas.style.width = `${(band.xMaxPt - band.xMinPt) * perPtX}px`;
    canvas.style.height = `${(band.yMaxPt - band.yMinPt) * perPtY}px`;
    return { perPtX, perPtY };
}
