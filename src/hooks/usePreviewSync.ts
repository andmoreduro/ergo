import {
    useCallback,
    useEffect,
    useRef,
    type MouseEvent,
    type RefObject,
} from "react";
import { logPreviewSyncError } from "../config/previewSync";
import { previewPointFromPageMouseEvent } from "../preview/previewPageMetrics";
import {
    closestChangedPageNumber,
    previewAnchorPageFromScroll,
    schedulePreviewPageScroll,
} from "../preview/previewScroll";
import { CompilerClient } from "../workers/compilerClient";
import type { ActionInvocation } from "../bindings/ActionInvocation";

export interface PreviewPageDescriptor {
    page_number: number;
    changed: boolean;
}

export interface UsePreviewSyncOptions {
    scrollRef: RefObject<HTMLElement | null>;
    previewRevision: number | null;
    previewPages: PreviewPageDescriptor[];
    dispatchAction: (invocation: ActionInvocation) => Promise<boolean>;
}

export function usePreviewSync({
    scrollRef,
    previewRevision,
    previewPages,
    dispatchAction,
}: UsePreviewSyncOptions) {
    const anchorPageRef = useRef<number | null>(null);
    const userOverrodeScrollRef = useRef(false);
    const programmaticScrollRef = useRef(false);
    const lastForwardScrollKeyRef = useRef<string | null>(null);
    const prevRevisionRef = useRef<number | null>(null);

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

    useEffect(() => {
        if (previewRevision === null) {
            return;
        }

        if (prevRevisionRef.current !== previewRevision) {
            userOverrodeScrollRef.current = false;
            prevRevisionRef.current = previewRevision;
        }

        if (userOverrodeScrollRef.current) {
            return;
        }

        const changedPages = previewPages
            .filter((page) => page.changed)
            .map((page) => page.page_number);
        if (changedPages.length === 0) {
            return;
        }

        const scrollKey = `${previewRevision}:${changedPages.join(",")}`;
        if (lastForwardScrollKeyRef.current === scrollKey) {
            return;
        }

        const scrollRoot = scrollRef.current;
        if (!scrollRoot) {
            return;
        }

        const anchorFromViewport = previewAnchorPageFromScroll(scrollRoot);
        const anchorPage = anchorFromViewport ?? anchorPageRef.current;
        const targetPage = closestChangedPageNumber(changedPages, anchorPage);
        if (targetPage === null) {
            return;
        }

        programmaticScrollRef.current = true;
        schedulePreviewPageScroll(scrollRoot, targetPage, {
            lastScrollKeyRef: lastForwardScrollKeyRef,
            scrollKey,
            isCancelled: () => userOverrodeScrollRef.current,
        });
        requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
        });
    }, [previewPages, previewRevision, scrollRef]);

    const handlePreviewClick = useCallback(
        (event: MouseEvent<HTMLElement>) => {
            if (previewRevision === null || !(event.target instanceof Element)) {
                return;
            }

            const pageElement = event.target.closest<HTMLElement>(
                "[data-preview-page-number]",
            );
            const pageNumber = Number(pageElement?.dataset.previewPageNumber);
            const pageContent = pageElement?.querySelector(
                "[data-preview-page-content]",
            );
            const point =
                pageContent instanceof HTMLElement
                    ? previewPointFromPageMouseEvent(event.nativeEvent, pageContent)
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
                        return;
                    }

                    if (result.status === "position") {
                        const elementId = result.position.elementId;
                        if (!elementId) {
                            return;
                        }
                        void dispatchAction({
                            id: "editor::FocusField",
                            payload: {
                                elementId,
                                fieldId: result.position.fieldId,
                                caretUtf16Offset: result.position.caretUtf16Offset,
                                anchorPageNumber: result.position.pageNumber,
                                sourceRevision: result.sourceRevision,
                            },
                        });
                    }
                })
                .catch((error) => {
                    logPreviewSyncError("jumpFromClick", error);
                });
        },
        [dispatchAction, previewRevision],
    );

    return { handlePreviewClick };
}
