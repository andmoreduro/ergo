type PageImageLike = {
    width: number;
    height: number;
    pixels: Uint8Array;
};

const workerCanvases = new Map<
    string,
    {
        canvas: OffscreenCanvas;
        ctx: OffscreenCanvasRenderingContext2D;
    }
>();

export function attachWorkerCanvas(
    canvasId: string,
    canvas: OffscreenCanvas,
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error(`Worker canvas ${canvasId} does not support 2D rendering`);
    }

    workerCanvases.set(canvasId, { canvas, ctx });
}

export function detachWorkerCanvas(canvasId: string): void {
    workerCanvases.delete(canvasId);
}

export function paintPageImageToWorkerCanvas(
    canvasId: string,
    pageImage: PageImageLike,
): { width: number; height: number } {
    const entry = workerCanvases.get(canvasId);
    if (!entry) {
        throw new Error(`No worker canvas attached for ${canvasId}`);
    }

    entry.canvas.width = pageImage.width;
    entry.canvas.height = pageImage.height;
    entry.ctx.imageSmoothingEnabled = false;
    entry.ctx.putImageData(
        new ImageData(
            new Uint8ClampedArray(
                pageImage.pixels.buffer,
                pageImage.pixels.byteOffset,
                pageImage.pixels.byteLength,
            ),
            pageImage.width,
            pageImage.height,
        ),
        0,
        0,
    );

    return { width: pageImage.width, height: pageImage.height };
}

export function resetWorkerCanvasRegistryForTests(): void {
    workerCanvases.clear();
}
