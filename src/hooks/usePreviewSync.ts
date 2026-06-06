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
    anchorPageFromVisibility,
    closestChangedPageNumber,
    schedulePreviewPageScroll,
} from "../preview/previewScroll";
import { CompilerClient } from "../workers/compilerClient";
import type { ActionInvocation } from "../bindings/ActionInvocation";

// IntersectionObserver thresholds at 5% steps so the visible-height map updates
// as pages scroll through the viewport without a callback per scrolled pixel.
const PAGE_VISIBILITY_THRESHOLDS = Array.from(
    { length: 21 },
    (_, index) => index / 20,
);

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
    const pageVisibilityRef = useRef<Map<number, number>>(new Map());

    // Stable while the set of page numbers is unchanged (the common case while
    // typing), so the observer is only rebuilt when pages are added or removed.
    const pageNumbersKey = previewPages
        .map((page) => page.page_number)
        .join(",");

    // Track which page occupies the most of the viewport without measuring: an
    // IntersectionObserver keeps a page-number -> visible-height map, so the
    // anchor is a cheap map read instead of a `getBoundingClientRect` sweep over
    // every page that forced a full preview reflow on every keystroke.
    useEffect(() => {
        const scrollRoot = scrollRef.current;
        if (!scrollRoot || typeof IntersectionObserver === "undefined") {
            return;
        }

        const visibility = pageVisibilityRef.current;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const element = entry.target as HTMLElement;
                    const pageNumber = Number(element.dataset.previewPageNumber);
                    if (!Number.isFinite(pageNumber)) {
                        continue;
                    }
                    if (
                        entry.isIntersecting &&
                        entry.intersectionRect.height > 0
                    ) {
                        visibility.set(pageNumber, entry.intersectionRect.height);
                    } else {
                        visibility.delete(pageNumber);
                    }
                }
                const anchor = anchorPageFromVisibility(visibility);
                if (anchor !== null) {
                    anchorPageRef.current = anchor;
                }
            },
            { root: scrollRoot, threshold: PAGE_VISIBILITY_THRESHOLDS },
        );

        for (const element of scrollRoot.querySelectorAll<HTMLElement>(
            "[data-preview-page-number]",
        )) {
            observer.observe(element);
        }

        return () => {
            observer.disconnect();
            visibility.clear();
        };
    }, [scrollRef, pageNumbersKey]);

    useEffect(() => {
        const scrollRoot = scrollRef.current;
        if (!scrollRoot) {
            return;
        }

        const onUserScroll = () => {
            // The anchor is maintained by the IntersectionObserver above; a user
            // scroll only needs to flag that auto-scroll should yield to them.
            if (programmaticScrollRef.current) {
                return;
            }
            userOverrodeScrollRef.current = true;
        };

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

        const anchorFromViewport = anchorPageFromVisibility(
            pageVisibilityRef.current,
        );
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
