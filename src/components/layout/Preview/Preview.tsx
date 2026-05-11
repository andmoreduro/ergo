import { useEffect, useRef, useState, type MouseEvent } from "react";
import { TauriApi } from "../../../api/tauri";
import { useDocument } from "../../../state/DocumentContext";
import { useCompiler } from "../../../hooks/useCompiler";
import type { PreviewElementPosition } from "../../../bindings/PreviewElementPosition";
import { useActionDispatcher } from "../../../actions/runtime";
import { m } from "../../../paraglide/messages.js";
import styles from "./Preview.module.css";

export interface PreviewProps {
    previewDebounceMs?: number;
}

export const Preview = ({ previewDebounceMs = 0 }: PreviewProps) => {
    const { state, documentFocus, events, sessionId } = useDocument();
    const dispatchAction = useActionDispatcher();
    const { svgs, error, sourceMap, previewRevision } = useCompiler(
        state,
        events,
        sessionId,
        previewDebounceMs,
    );
    const previewRef = useRef<HTMLDivElement>(null);
    const [highlightedPosition, setHighlightedPosition] =
        useState<PreviewElementPosition | null>(null);
    const activeSource = sourceMap.find(
        (entry) => entry.elementId === documentFocus.elementId,
    );

    useEffect(() => {
        if (!documentFocus.elementId || previewRevision === null) {
            setHighlightedPosition(null);
            return;
        }

        let isCancelled = false;
        const target = {
            elementId: documentFocus.elementId,
            fieldId: documentFocus.fieldId,
            caretUtf16Offset: documentFocus.caretUtf16Offset,
            sourceRevision: previewRevision,
        };

        void TauriApi.getPreviewPositionsForFocus(target, previewRevision)
            .then((result) => {
                if (isCancelled) {
                    return;
                }

                if (result.status !== "matched" || result.positions.length === 0) {
                    setHighlightedPosition(null);
                    return;
                }

                const [position] = result.positions;
                setHighlightedPosition(position);
                const page = previewRef.current?.querySelector<HTMLElement>(
                    `[data-preview-page-number="${position.pageNumber}"]`,
                );
                page?.scrollIntoView?.({ block: "nearest" });
            })
            .catch(() => {
                if (!isCancelled) {
                    setHighlightedPosition(null);
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [
        documentFocus.caretUtf16Offset,
        documentFocus.elementId,
        documentFocus.fieldId,
        previewRevision,
    ]);

    const handlePreviewClick = (event: MouseEvent<HTMLElement>) => {
        if (previewRevision === null || !(event.target instanceof Element)) {
            return;
        }

        const pageElement = event.target.closest<HTMLElement>(
            "[data-preview-page-number]",
        );
        const pageNumber = Number(pageElement?.dataset.previewPageNumber);
        const svg = pageElement?.querySelector("svg");
        const point = svg ? previewPointFromMouseEvent(event, svg) : null;

        if (!pageElement || !Number.isFinite(pageNumber) || !point) {
            return;
        }

        void TauriApi.jumpFromPreviewClick(
            pageNumber,
            point.xPt,
            point.yPt,
            previewRevision,
        )
            .then((result) => {
                if (result.status === "field") {
                    void dispatchAction({
                        id: "editor::FocusField",
                        payload: result.target,
                    });
                    return;
                }

                if (result.status === "element") {
                    void dispatchAction({
                        id: "editor::FocusField",
                        payload: {
                            elementId: result.elementId,
                            fieldId: null,
                            caretUtf16Offset: null,
                            sourceRevision: result.sourceRevision,
                        },
                    });
                }
            })
            .catch(() => undefined);
    };

    return (
        <aside
            className={styles.preview}
            data-active-source-label={activeSource?.label}
            onClick={handlePreviewClick}
        >
            <h2>{m.workspace_live_preview()}</h2>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.svgContainer} ref={previewRef}>
                {svgs.length > 0 ? (
                    svgs.map((svg, index) => {
                        const pageNumber = index + 1;
                        const markerStyle =
                            highlightedPosition?.pageNumber === pageNumber
                                ? markerStyleForSvg(highlightedPosition, svg)
                                : null;

                        return (
                            <div
                                key={index}
                                className={styles.page}
                                data-preview-page-number={pageNumber}
                                data-active-preview-page={
                                    markerStyle ? "true" : undefined
                                }
                            >
                                <div dangerouslySetInnerHTML={{ __html: svg }} />
                                {markerStyle && (
                                    <span
                                        className={styles.syncMarker}
                                        style={markerStyle}
                                    />
                                )}
                            </div>
                        );
                    })
                ) : (
                    <div className={styles.placeholder}>
                        {m.workspace_preview_placeholder()}
                    </div>
                )}
            </div>
        </aside>
    );
};

const markerStyleForSvg = (
    position: PreviewElementPosition,
    svg: string,
): { left: string; top: string } | null => {
    const viewBox = parseSvgViewBoxString(svg);
    if (!viewBox) {
        return null;
    }

    return {
        left: `${((position.xPt - viewBox.x) / viewBox.width) * 100}%`,
        top: `${((position.yPt - viewBox.y) / viewBox.height) * 100}%`,
    };
};

const previewPointFromMouseEvent = (
    event: MouseEvent<HTMLElement>,
    svg: SVGSVGElement,
): { xPt: number; yPt: number } | null => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    const viewBox = parseSvgViewBox(svg.getAttribute("viewBox"), rect);
    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;

    return {
        xPt: viewBox.x + xRatio * viewBox.width,
        yPt: viewBox.y + yRatio * viewBox.height,
    };
};

const parseSvgViewBox = (
    value: string | null,
    fallback: DOMRect,
): { x: number; y: number; width: number; height: number } => {
    const parts =
        value
            ?.trim()
            .split(/\s+/)
            .map(Number)
            .filter((part) => Number.isFinite(part)) ?? [];

    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        return {
            x: parts[0],
            y: parts[1],
            width: parts[2],
            height: parts[3],
        };
    }

    return {
        x: 0,
        y: 0,
        width: fallback.width,
        height: fallback.height,
    };
};

const parseSvgViewBoxString = (
    svg: string,
): { x: number; y: number; width: number; height: number } | null => {
    const match = svg.match(/\bviewBox=["']([^"']+)["']/);
    if (!match) {
        return null;
    }

    const parts = match[1]
        .trim()
        .split(/\s+/)
        .map(Number)
        .filter((part) => Number.isFinite(part));

    if (parts.length !== 4 || parts[2] <= 0 || parts[3] <= 0) {
        return null;
    }

    return {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
    };
};
