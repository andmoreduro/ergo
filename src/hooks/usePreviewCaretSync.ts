import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type MouseEvent,
    type RefObject,
} from "react";
import type { PreviewElementPosition } from "../bindings/PreviewElementPosition";
import type { PreviewFocusTarget } from "../bindings/PreviewFocusTarget";
import { logPreviewSyncError } from "../config/previewSync";
import { backendFocusIdsForEditorField } from "../editor/fieldIds";
import {
    previewPointFromCanvasMouseEvent,
    syntheticCaretCue,
} from "../preview/canvasMetrics";
import {
    caretScrollKey,
    focusScrollIdentity,
    previewAnchorPageFromScroll,
    schedulePreviewCaretScroll,
} from "../preview/previewScroll";
import { CompilerClient } from "../workers/compilerClient";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import type { DocumentFocusState } from "../state/DocumentContext";

export interface UsePreviewCaretSyncOptions {
    scrollRef: RefObject<HTMLElement | null>;
    documentFocus: DocumentFocusState;
    previewRevision: number | null;
    dispatchAction: (invocation: ActionInvocation) => Promise<boolean>;
}

export function usePreviewCaretSync({
    scrollRef,
    documentFocus,
    previewRevision,
    dispatchAction,
}: UsePreviewCaretSyncOptions) {
    const syncCueRequestIdRef = useRef(0);
    const lastCaretScrollKeyRef = useRef<string | null>(null);
    const focusScrollIdentityRef = useRef<string | null>(null);
    const anchorPageRef = useRef<number | null>(null);
    const userOverrodeScrollRef = useRef(false);
    const programmaticScrollRef = useRef(false);
    const layoutScrollRef = useRef<{ zoom: number } | null>(null);
    const [highlightedPosition, setHighlightedPosition] =
        useState<PreviewElementPosition | null>(null);

    useEffect(() => {
        const scrollRoot = scrollRef.current;
        if (!scrollRoot) {
            return;
        }

        const updateAnchorFromScroll = () => {
            const page = previewAnchorPageFromScroll(scrollRoot);
            if (page !== null) {
                anchorPageRef.current = page;
            }
        };

        const onUserScroll = () => {
            updateAnchorFromScroll();
            if (programmaticScrollRef.current) {
                return;
            }
            userOverrodeScrollRef.current = true;
        };

        updateAnchorFromScroll();
        scrollRoot.addEventListener("scroll", onUserScroll, { passive: true });
        return () => scrollRoot.removeEventListener("scroll", onUserScroll);
    }, [scrollRef]);

    const clearHighlightedPosition = useCallback(() => {
        syncCueRequestIdRef.current += 1;
        lastCaretScrollKeyRef.current = null;
        focusScrollIdentityRef.current = null;
        setHighlightedPosition(null);
    }, []);

    const normalizeCaretPosition = useCallback(
        (position: PreviewElementPosition): PreviewElementPosition => ({
            ...position,
            caretCue: syntheticCaretCue(position),
        }),
        [],
    );

    const scheduleScrollToHighlightedCaret = useCallback(
        (
            position: PreviewElementPosition,
            options?: {
                force?: boolean;
                layout?: { zoom: number };
            },
        ) => {
            if (userOverrodeScrollRef.current && !options?.force) {
                return;
            }

            const scrollRoot = scrollRef.current;
            if (!scrollRoot) {
                return;
            }

            const withCaret = normalizeCaretPosition(position);
            const key = caretScrollKey(withCaret);

            programmaticScrollRef.current = true;
            schedulePreviewCaretScroll(
                scrollRoot,
                {
                    pageNumber: withCaret.pageNumber,
                    xPt: withCaret.xPt,
                    caretCue: withCaret.caretCue!,
                },
                {
                    force: options?.force ?? false,
                    lastScrollKeyRef: lastCaretScrollKeyRef,
                    scrollKey: key,
                    isCancelled: () => userOverrodeScrollRef.current,
                },
            );
            requestAnimationFrame(() => {
                programmaticScrollRef.current = false;
            });

            if (options?.layout) {
                layoutScrollRef.current = options.layout;
            }
        },
        [normalizeCaretPosition, scrollRef],
    );

    const requestHighlightedPosition = useCallback(
        async (
            target: PreviewFocusTarget,
            displayedRevision: number,
            shouldScroll: boolean,
        ) => {
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

                const raw =
                    result.status === "matched" && result.positions.length > 0
                        ? result.positions[0]
                        : null;
                if (!raw) {
                    lastCaretScrollKeyRef.current = null;
                    setHighlightedPosition(null);
                    return;
                }

                const position = normalizeCaretPosition(raw);
                anchorPageRef.current = position.pageNumber;
                setHighlightedPosition(position);
                if (shouldScroll) {
                    scheduleScrollToHighlightedCaret(position);
                }
            } catch (error) {
                if (requestId === syncCueRequestIdRef.current) {
                    lastCaretScrollKeyRef.current = null;
                    setHighlightedPosition(null);
                    logPreviewSyncError("positionsForFocus", error);
                }
            }
        },
        [normalizeCaretPosition, scheduleScrollToHighlightedCaret],
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
        const scrollRoot = scrollRef.current;
        const anchorFromViewport = scrollRoot
            ? previewAnchorPageFromScroll(scrollRoot)
            : null;
        const anchorPageNumber =
            documentFocus.anchorPageNumber ??
            anchorPageRef.current ??
            anchorFromViewport ??
            null;

        const target = {
            elementId: previewTarget.elementId,
            fieldId: previewTarget.fieldId,
            caretUtf16Offset: documentFocus.caretUtf16Offset,
            anchorPageNumber,
            sourceRevision: previewRevision,
        };

        const identity = focusScrollIdentity(
            previewRevision,
            target.elementId,
            target.fieldId,
        );
        const identityChanged = focusScrollIdentityRef.current !== identity;
        const shouldScroll =
            documentFocus.forcePreviewScroll || identityChanged;
        if (identityChanged) {
            focusScrollIdentityRef.current = identity;
            lastCaretScrollKeyRef.current = null;
        }
        if (shouldScroll) {
            userOverrodeScrollRef.current = false;
        }

        void requestHighlightedPosition(target, previewRevision, shouldScroll);
    }, [
        clearHighlightedPosition,
        documentFocus.anchorPageNumber,
        documentFocus.caretUtf16Offset,
        documentFocus.elementId,
        documentFocus.fieldId,
        documentFocus.forcePreviewScroll,
        previewRevision,
        requestHighlightedPosition,
    ]);

    const scrollCaretAfterPageRender = useCallback(
        (pageNumber: number) => {
            if (
                userOverrodeScrollRef.current ||
                highlightedPosition === null ||
                highlightedPosition.pageNumber !== pageNumber
            ) {
                return;
            }

            scheduleScrollToHighlightedCaret(highlightedPosition);
        },
        [highlightedPosition, scheduleScrollToHighlightedCaret],
    );

    const syncCaretScrollToLayout = useCallback(
        (zoom: number) => {
            if (userOverrodeScrollRef.current || !highlightedPosition) {
                return;
            }

            const prev = layoutScrollRef.current;
            const layoutChanged = prev !== null && prev.zoom !== zoom;
            if (!layoutChanged) {
                return;
            }

            layoutScrollRef.current = { zoom };
            scheduleScrollToHighlightedCaret(highlightedPosition, {
                force: true,
                layout: { zoom },
            });
        },
        [highlightedPosition, scheduleScrollToHighlightedCaret],
    );

    const handlePreviewClick = useCallback(
        (event: MouseEvent<HTMLElement>) => {
            if (previewRevision === null || !(event.target instanceof Element)) {
                return;
            }

            const pageElement = event.target.closest<HTMLElement>(
                "[data-preview-page-number]",
            );
            const pageNumber = Number(pageElement?.dataset.previewPageNumber);
            const canvas = pageElement?.querySelector("canvas");
            const point =
                canvas instanceof HTMLCanvasElement
                    ? previewPointFromCanvasMouseEvent(event.nativeEvent, canvas)
                    : null;

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
                        userOverrodeScrollRef.current = false;
                        lastCaretScrollKeyRef.current = null;
                        if (result.sourceRevision === previewRevision) {
                            void requestHighlightedPosition(
                                result.target,
                                previewRevision,
                                true,
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
                .catch((error) => {
                    logPreviewSyncError("jumpFromClick", error);
                });
        },
        [
            clearHighlightedPosition,
            dispatchAction,
            previewRevision,
            requestHighlightedPosition,
        ],
    );

    return {
        highlightedPosition,
        handlePreviewClick,
        scrollCaretAfterPageRender,
        syncCaretScrollToLayout,
    };
}
