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
    scrollPreviewToCaret,
} from "../preview/previewScroll";
import { CompilerClient } from "../workers/compilerClient";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import type { PreviewCaret } from "./usePreviewCaret";

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
    /** Forward-sync caret position (null when it has no rendered spot). */
    caret: PreviewCaret | null;
    /** Revision the caret was resolved for; gates the content-change scroll. */
    caretRevision: number | null;
    /** Effective zoom; a change re-anchors the view so the caret stays visible. */
    zoom: number;
}

export function usePreviewSync({
    scrollRef,
    previewRevision,
    previewPages,
    dispatchAction,
    caret,
    caretRevision,
    zoom,
}: UsePreviewSyncOptions) {
    const anchorPageRef = useRef<number | null>(null);
    const userOverrodeScrollRef = useRef(false);
    const programmaticScrollRef = useRef(false);
    const lastForwardScrollKeyRef = useRef<string | null>(null);
    const prevRevisionRef = useRef<number | null>(null);
    const prevZoomRef = useRef(zoom);
    const handledRevisionRef = useRef<number | null>(null);
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
        const scrollRoot = scrollRef.current;
        if (!scrollRoot) {
            return;
        }

        // A new compile re-engages auto-scroll (the user is editing again).
        if (prevRevisionRef.current !== previewRevision) {
            userOverrodeScrollRef.current = false;
            prevRevisionRef.current = previewRevision;
        }

        // Only a content change (a fresh compile that actually changed pages)
        // makes the preview chase the caret — never a bare cursor move or zoom, so
        // the user is free to scroll/look elsewhere while editing. Act once per
        // revision, and only after forward sync has resolved the caret for it.
        if (caretRevision !== previewRevision) {
            return;
        }
        if (handledRevisionRef.current === previewRevision) {
            return;
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

        // Precise spot available: scroll to keep the caret in view (with its
        // comfortably-visible dead zone), the inverse of click-to-source.
        if (caret) {
            handledRevisionRef.current = previewRevision;
            programmaticScrollRef.current = true;
            scrollPreviewToCaret(scrollRoot, caret);
            requestAnimationFrame(() => {
                programmaticScrollRef.current = false;
            });
            return;
        }

        // No caret cue — fall back to the nearest changed page.
        const scrollKey = `${previewRevision}:${changedPages.join(",")}`;
        if (lastForwardScrollKeyRef.current === scrollKey) {
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
        handledRevisionRef.current = previewRevision;

        // If the changed page is already the one dominating the viewport, the
        // user is looking right at it — snapping would only cost a full-preview
        // repaint per keystroke without moving anything into view. Only follow
        // the edit when it lands on a different (off-screen) page.
        if (anchorPage !== null && targetPage === anchorPage) {
            lastForwardScrollKeyRef.current = scrollKey;
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
    }, [previewPages, previewRevision, scrollRef, caret, caretRevision]);

    // Zooming changes every page's pixel size, so a caret that was on screen would
    // otherwise slide out of view. Re-anchor the scroll to keep the caret centered
    // on a zoom change only (not on caret moves), so the cue stays visible.
    useEffect(() => {
        if (prevZoomRef.current === zoom) {
            return;
        }
        prevZoomRef.current = zoom;
        const scrollRoot = scrollRef.current;
        if (!scrollRoot || !caret) {
            return;
        }
        programmaticScrollRef.current = true;
        scrollPreviewToCaret(scrollRoot, caret, { forceCenter: true });
        requestAnimationFrame(() => {
            programmaticScrollRef.current = false;
        });
    }, [zoom, caret, scrollRef]);

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
