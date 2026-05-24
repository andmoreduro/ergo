import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type MouseEvent,
} from "react";
import { CompilerClient } from "../../../workers/compilerClient";
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
    const { previewPages, error, sourceMap, previewRevision, latencyMs } = compiler;
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
                const result = await CompilerClient.positionsForFocus(
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
        const canvas = pageElement?.querySelector("canvas");
        const pixelPerPt = 1.3333 * (window.devicePixelRatio || 1);
        const point = canvas ? previewPointFromCanvasMouseEvent(event, canvas, pixelPerPt) : null;

        if (!pageElement || !Number.isFinite(pageNumber) || !point) {
            return;
        }

        void CompilerClient.jumpFromClick(
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
                {previewPages.length > 0 ? (
                    previewPages.map((page, index) => {
                        const pageNumber = page.page_number;
                        return (
                            <PreviewPageCanvas
                                key={index}
                                pageIndex={index}
                                pageNumber={pageNumber}
                                previewRevision={previewRevision || 0}
                                pixelPerPt={1.3333 * (window.devicePixelRatio || 1)}
                                highlightedPosition={highlightedPosition}
                            />
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

interface PreviewPageCanvasProps {
    pageIndex: number;
    pageNumber: number;
    previewRevision: number;
    pixelPerPt: number;
    highlightedPosition: PreviewElementPosition | null;
}

const PreviewPageCanvas = ({
    pageIndex,
    pageNumber,
    previewRevision,
    pixelPerPt,
    highlightedPosition,
}: PreviewPageCanvasProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderRequestIdRef = useRef(0);
    const [aspectRatio, setAspectRatio] = useState<number>(595.27 / 841.89);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const requestId = renderRequestIdRef.current + 1;
        renderRequestIdRef.current = requestId;

        let cancelled = false;

        CompilerClient.renderPage(pageIndex, pixelPerPt, requestId)
            .then((result) => {
                if (cancelled || result.requestId !== renderRequestIdRef.current) {
                    return;
                }

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                canvas.width = result.width;
                canvas.height = result.height;

                const imgData = new ImageData(
                    new Uint8ClampedArray(result.pixels.buffer, result.pixels.byteOffset, result.pixels.byteLength),
                    result.width,
                    result.height
                );
                ctx.putImageData(imgData, 0, 0);

                const widthPt = result.width / pixelPerPt;
                const heightPt = result.height / pixelPerPt;
                setAspectRatio(widthPt / heightPt);
            })
            .catch((err) => {
                console.error("Failed to render page to canvas:", err);
            });

        return () => {
            cancelled = true;
        };
    }, [pageIndex, previewRevision, pixelPerPt]);

    const caretStyle =
        highlightedPosition && highlightedPosition.pageNumber === pageNumber
            ? caretStyleForCanvas(highlightedPosition, canvasRef.current, pixelPerPt)
            : null;

    return (
        <div
            className={styles.page}
            data-preview-page-number={pageNumber}
            data-active-preview-page={caretStyle ? "true" : undefined}
            style={{ aspectRatio, position: "relative" }}
        >
            <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
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
};

const caretStyleForCanvas = (
    position: PreviewElementPosition,
    canvas: HTMLCanvasElement | null,
    pixelPerPt: number,
): { left: string; top: string; height: string } | null => {
    const caretCue = position.caretCue;
    if (!caretCue || !canvas || canvas.width === 0 || canvas.height === 0) {
        return null;
    }

    const widthPt = canvas.width / pixelPerPt;
    const heightPt = canvas.height / pixelPerPt;

    return {
        left: toPercent(position.xPt / widthPt),
        top: toPercent(caretCue.topYPt / heightPt),
        height: toPercent(caretCue.heightPt / heightPt),
    };
};

const toPercent = (ratio: number) => `${Number((ratio * 100).toFixed(4))}%`;

const previewPointFromCanvasMouseEvent = (
    event: MouseEvent<HTMLElement>,
    canvas: HTMLCanvasElement,
    pixelPerPt: number,
): { xPt: number; yPt: number } | null => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;

    const widthPt = canvas.width / pixelPerPt;
    const heightPt = canvas.height / pixelPerPt;

    return {
        xPt: xRatio * widthPt,
        yPt: yRatio * heightPt,
    };
};
