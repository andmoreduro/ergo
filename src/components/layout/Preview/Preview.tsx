import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type MouseEvent,
} from "react";
import { TauriApi } from "../../../api/tauri";
import { useDocumentFocus } from "../../../state/DocumentContext";
import type { useCompiler } from "../../../hooks/useCompiler";
import type { PreviewElementPosition } from "../../../bindings/PreviewElementPosition";
import type { PreviewFocusTarget } from "../../../bindings/PreviewFocusTarget";
import { backendFocusIdsForEditorField } from "../../../editor/fieldIds";
import { useActionDispatcher } from "../../../actions/runtime";
import { m } from "../../../paraglide/messages.js";
import styles from "./Preview.module.css";

export type PreviewCompilerState = ReturnType<typeof useCompiler>;

export interface PreviewProps {
    compiler: PreviewCompilerState;
}

export const Preview = ({ compiler }: PreviewProps) => {
    const { documentFocus } = useDocumentFocus();
    const dispatchAction = useActionDispatcher();
    const { svgs, error, sourceMap, previewRevision, latencyMs } = compiler;
    const previewRef = useRef<HTMLDivElement>(null);
    const syncCueRequestIdRef = useRef(0);
    const [highlightedPosition, setHighlightedPosition] =
        useState<PreviewElementPosition | null>(null);
    const activeSource = sourceMap.find(
        (entry) => entry.elementId === documentFocus.elementId,
    );

    const clearHighlightedPosition = useCallback(() => {
        syncCueRequestIdRef.current += 1;
        setHighlightedPosition(null);
    }, []);

    const requestHighlightedPosition = useCallback(
        async (target: PreviewFocusTarget, displayedRevision: number) => {
            const requestId = syncCueRequestIdRef.current + 1;
            syncCueRequestIdRef.current = requestId;

            try {
                const result = await TauriApi.getPreviewPositionsForFocus(
                    target,
                    displayedRevision,
                );
                if (requestId !== syncCueRequestIdRef.current) {
                    return;
                }

                const position =
                    result.status === "matched"
                        ? result.positions.find((entry) => entry.caretCue)
                        : null;
                if (!position) {
                    setHighlightedPosition(null);
                    return;
                }

                setHighlightedPosition(position);
                const page = previewRef.current?.querySelector<HTMLElement>(
                    `[data-preview-page-number="${position.pageNumber}"]`,
                );
                page?.scrollIntoView?.({ block: "nearest" });
            } catch {
                if (requestId === syncCueRequestIdRef.current) {
                    setHighlightedPosition(null);
                }
            }
        },
        [],
    );

    useEffect(() => {
        if (!documentFocus.elementId || previewRevision === null) {
            clearHighlightedPosition();
            return;
        }

        const previewTarget = backendFocusIdsForEditorField(
            documentFocus.elementId,
            documentFocus.fieldId,
        );
        const target = {
            elementId: previewTarget.elementId,
            fieldId: previewTarget.fieldId,
            caretUtf16Offset: documentFocus.caretUtf16Offset,
            sourceRevision: previewRevision,
        };

        void requestHighlightedPosition(target, previewRevision);
    }, [
        clearHighlightedPosition,
        documentFocus.caretUtf16Offset,
        documentFocus.elementId,
        documentFocus.fieldId,
        previewRevision,
        requestHighlightedPosition,
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
                    if (result.sourceRevision === previewRevision) {
                        void requestHighlightedPosition(
                            result.target,
                            previewRevision,
                        );
                    }
                    void dispatchAction({
                        id: "editor::FocusField",
                        payload: result.target,
                    });
                    return;
                }

                if (result.status === "element") {
                    clearHighlightedPosition();
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
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.svgContainer} ref={previewRef}>
                {svgs.length > 0 ? (
                    svgs.map((svg, index) => {
                        const pageNumber = index + 1;
                        const caretStyle =
                            highlightedPosition?.pageNumber === pageNumber
                                ? caretStyleForSvg(highlightedPosition, svg)
                                : null;

                        return (
                            <div
                                key={index}
                                className={styles.page}
                                data-preview-page-number={pageNumber}
                                data-active-preview-page={
                                    caretStyle ? "true" : undefined
                                }
                            >
                                <div dangerouslySetInnerHTML={{ __html: svg }} />
                                {caretStyle && (
                                    <span
                                        key={`${highlightedPosition?.sourceRevision}-${highlightedPosition?.elementId}-${highlightedPosition?.fieldId}-${highlightedPosition?.caretUtf16Offset}-${caretStyle.left}-${caretStyle.top}`}
                                        className={styles.syncCaret}
                                        data-preview-sync-caret="true"
                                        style={caretStyle}
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
            {latencyMs !== null && (
                <div className={styles.telemetryOverlay}>
                    {m.preview_telemetry({ latency: latencyMs })}
                </div>
            )}
        </aside>
    );
};

const caretStyleForSvg = (
    position: PreviewElementPosition,
    svg: string,
): { left: string; top: string; height: string } | null => {
    const caretCue = position.caretCue;
    if (!caretCue) {
        return null;
    }

    const viewBox = parseSvgViewBoxString(svg);
    if (!viewBox) {
        return null;
    }

    return {
        left: toPercent((position.xPt - viewBox.x) / viewBox.width),
        top: toPercent((caretCue.topYPt - viewBox.y) / viewBox.height),
        height: toPercent(caretCue.heightPt / viewBox.height),
    };
};

const toPercent = (ratio: number) => `${Number((ratio * 100).toFixed(4))}%`;

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
