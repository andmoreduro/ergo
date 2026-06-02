import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ResourcePreview as ResourcePreviewDto } from "../../../bindings/ResourcePreview";
import { CompilerClient } from "../../../workers/compilerClient";
import { m } from "../../../paraglide/messages.js";
import styles from "./ResourcePreview.module.css";

const parseCssLengthPx = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "none") {
        return null;
    }

    if (trimmed.endsWith("px")) {
        const px = Number.parseFloat(trimmed);
        return Number.isFinite(px) ? px : null;
    }

    if (trimmed.endsWith("rem")) {
        const rem = Number.parseFloat(trimmed);
        if (!Number.isFinite(rem)) {
            return null;
        }
        const rootSize = Number.parseFloat(
            getComputedStyle(document.documentElement).fontSize,
        );
        return rem * (Number.isFinite(rootSize) ? rootSize : 16);
    }

    if (trimmed.endsWith("vh")) {
        const vh = Number.parseFloat(trimmed);
        return Number.isFinite(vh) ? (window.innerHeight * vh) / 100 : null;
    }

    if (trimmed.endsWith("dvh")) {
        const dvh = Number.parseFloat(trimmed);
        return Number.isFinite(dvh) ? (window.innerHeight * dvh) / 100 : null;
    }

    return null;
};

const previewMaxHeightPx = (element: HTMLElement): number => {
    const maxHeight = getComputedStyle(element).maxHeight;
    return parseCssLengthPx(maxHeight) ?? 120;
};

const svgPreviewStyle = (
    widthPt: number,
    heightPt: number,
    fitSize: { width: number; height: number },
): CSSProperties => {
    const scale = Math.min(fitSize.width / widthPt, fitSize.height / heightPt);
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return {
        width: `${widthPt * safeScale}px`,
        height: `${heightPt * safeScale}px`,
    };
};

const ResourcePreviewSvg = ({
    pageNumber,
    revision,
    canRender,
}: {
    pageNumber: number;
    revision: number;
    canRender: boolean;
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<HTMLDivElement>(null);
    const requestIdRef = useRef(0);
    const [fitSize, setFitSize] = useState({ width: 0, height: 0 });
    const [svgStyle, setSvgStyle] = useState<CSSProperties | undefined>(
        undefined,
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const updateFitSize = () => {
            setFitSize({
                width: container.clientWidth,
                height: previewMaxHeightPx(container),
            });
        };

        updateFitSize();

        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(updateFitSize);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const element = svgRef.current;
        if (!element || !canRender || fitSize.width <= 0 || fitSize.height <= 0) {
            return;
        }

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        let cancelled = false;

        void CompilerClient.renderResourceSvgPage(pageNumber, requestId)
            .then((page) => {
                if (cancelled || page.requestId !== requestIdRef.current) {
                    return;
                }
                element.innerHTML = page.svg;
                setSvgStyle(
                    svgPreviewStyle(page.widthPt, page.heightPt, fitSize),
                );
            })
            .catch((error) => {
                console.error("Failed to render resource preview SVG:", error);
            });

        return () => {
            cancelled = true;
        };
    }, [canRender, fitSize, pageNumber, revision]);

    return (
        <div ref={containerRef} className={styles.preview}>
            {fitSize.width > 0 ? (
                <div
                    ref={svgRef}
                    aria-hidden="true"
                    className={styles.svgHost}
                    style={svgStyle}
                />
            ) : (
                <span className={styles.loading} aria-hidden="true" />
            )}
        </div>
    );
};

export const ResourcePreviewPanel = ({
    preview,
    revision,
    canRender,
}: {
    preview: ResourcePreviewDto;
    revision: number;
    canRender: boolean;
}) => {
    if (preview.status === "ready" && preview.page_number) {
        return (
            <ResourcePreviewSvg
                pageNumber={preview.page_number}
                revision={revision}
                canRender={canRender}
            />
        );
    }

    return (
        <span className={styles.unavailable}>
            {preview.diagnostic ?? m.resources_preview_unavailable()}
        </span>
    );
};
