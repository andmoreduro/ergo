import { useEffect, useRef, useState } from "react";
import type { RenderPagePayload } from "../workers/compilerProtocol";

type RenderPage = (requestId: number) => Promise<RenderPagePayload>;

export function putTypstPageOnCanvas(
    canvas: HTMLCanvasElement,
    result: RenderPagePayload,
): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }

    canvas.width = result.width;
    canvas.height = result.height;

    const imgData = new ImageData(
        new Uint8ClampedArray(
            result.pixels.buffer,
            result.pixels.byteOffset,
            result.pixels.byteLength,
        ),
        result.width,
        result.height,
    );
    ctx.putImageData(imgData, 0, 0);
}

export function useTypstCanvasPage(
    renderPage: RenderPage,
    pixelPerPt: number,
    deps: readonly unknown[],
    options?: {
        onError?: (error: unknown) => void;
    },
) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderRequestIdRef = useRef(0);
    const [aspectRatio, setAspectRatio] = useState(595.27 / 841.89);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const requestId = renderRequestIdRef.current + 1;
        renderRequestIdRef.current = requestId;

        let cancelled = false;

        void renderPage(requestId)
            .then((result) => {
                if (cancelled || result.requestId !== renderRequestIdRef.current) {
                    return;
                }

                putTypstPageOnCanvas(canvas, result);

                const widthPt = result.width / pixelPerPt;
                const heightPt = result.height / pixelPerPt;
                if (heightPt > 0) {
                    setAspectRatio(widthPt / heightPt);
                }
            })
            .catch((error) => {
                options?.onError?.(error);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies compile/render deps
    }, deps);

    return { canvasRef, aspectRatio };
}
