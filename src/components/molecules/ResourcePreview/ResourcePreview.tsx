import { useCallback, useEffect, useRef, useState } from "react";
import type { ResourcePreview as ResourcePreviewDto } from "../../../bindings/ResourcePreview";
import { CompilerClient } from "../../../workers/compilerClient";
import { m } from "../../../paraglide/messages.js";
import styles from "./ResourcePreview.module.css";

const ResourcePreviewCanvas = ({
    pageNumber,
    revision,
    canRender,
    resizeDebounceMs,
}: {
    pageNumber: number;
    revision: number;
    canRender: boolean;
    resizeDebounceMs: number;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestIdRef = useRef(0);
    const hasRenderedRef = useRef(false);
    const renderTimerRef = useRef<number | null>(null);
    const [fitWidth, setFitWidth] = useState(0);
    const [aspectRatio, setAspectRatio] = useState<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const updateFitWidth = () => {
            setFitWidth(Math.max(0, Math.round(container.clientWidth)));
        };

        updateFitWidth();

        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(updateFitWidth);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const root = containerRef.current;
        if (!root || typeof IntersectionObserver === "undefined") {
            setVisible(true);
            return;
        }
        const observer = new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            { root: null, rootMargin: "64px", threshold: 0 },
        );
        observer.observe(root);
        return () => observer.disconnect();
    }, []);

    const renderThumbnail = useCallback(() => {
        if (!canRender || !visible || fitWidth <= 0) {
            return;
        }

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        const widthAtRequest = fitWidth;

        const dpr =
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const targetWidthPx = Math.max(1, Math.round(widthAtRequest * dpr));

        void CompilerClient.renderResourceRegion(
            pageNumber,
            targetWidthPx,
            0,
            Number.MAX_SAFE_INTEGER,
            0,
            Number.MAX_SAFE_INTEGER,
            requestId,
        )
            .then((payload) => {
                if (requestId !== requestIdRef.current) {
                    payload.bitmap.close();
                    return;
                }
                if (payload.bandWidth <= 0 || payload.bandHeight <= 0) {
                    payload.bitmap.close();
                    return;
                }

                const canvas = canvasRef.current;
                if (!canvas) {
                    payload.bitmap.close();
                    return;
                }

                // The backing store carries the page's intrinsic pixel
                // dimensions; CSS scales it to fill the container box. The
                // canvas is positioned out of flow (see the stylesheet), so it
                // never contributes its intrinsic width to ancestor min-content
                // sizing — the container width stays purely top-down, which is
                // what lets the thumbnail shrink with the sidebar.
                canvas.width = payload.bandWidth;
                canvas.height = payload.bandHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    payload.bitmap.close();
                    return;
                }
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(payload.bitmap, 0, 0);
                payload.bitmap.close();

                hasRenderedRef.current = true;
                setAspectRatio(`${payload.bandWidth} / ${payload.bandHeight}`);
                setReady(true);
            })
            .catch((error) => {
                console.error(
                    `Resource preview render failed (page ${pageNumber}):`,
                    error,
                );
            });
    }, [canRender, visible, fitWidth, pageNumber]);

    useEffect(() => {
        if (!canRender || !visible || fitWidth <= 0) {
            return;
        }
        if (renderTimerRef.current !== null) {
            clearTimeout(renderTimerRef.current);
        }
        const delay = hasRenderedRef.current ? resizeDebounceMs : 0;
        renderTimerRef.current = window.setTimeout(() => {
            renderTimerRef.current = null;
            renderThumbnail();
        }, delay);
        return () => {
            if (renderTimerRef.current !== null) {
                clearTimeout(renderTimerRef.current);
                renderTimerRef.current = null;
            }
        };
    }, [canRender, visible, fitWidth, revision, renderThumbnail, resizeDebounceMs]);

    // Drive the container height from the rasterized aspect ratio so the box
    // stays proportional as the column resizes (the canvas fills it). `minHeight`
    // clears the loading-placeholder floor once a real thumbnail exists.
    const previewStyle =
        ready && aspectRatio
            ? { aspectRatio, minHeight: 0 }
            : undefined;

    return (
        <div ref={containerRef} className={styles.preview} style={previewStyle}>
            <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
            {!ready ? <span className={styles.loading} aria-hidden="true" /> : null}
        </div>
    );
};

export const ResourcePreviewPanel = ({
    preview,
    revision,
    canRender,
    resizeDebounceMs = 200,
}: {
    preview: ResourcePreviewDto;
    revision: number;
    canRender: boolean;
    resizeDebounceMs?: number;
}) => {
    if (preview.status === "ready" && preview.page_number) {
        return (
            <ResourcePreviewCanvas
                pageNumber={preview.page_number}
                revision={revision}
                canRender={canRender}
                resizeDebounceMs={resizeDebounceMs}
            />
        );
    }

    return (
        <span className={styles.unavailable}>
            {preview.diagnostic ?? m.resources_preview_unavailable()}
        </span>
    );
};
