import {
    useCallback,
    useEffect,
    useRef,
    type MouseEvent,
    type MutableRefObject,
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
    /** Page dominating the viewport, maintained by `usePreviewViewportAnchor`. */
    anchorPageRef: MutableRefObject<number | null>;
    /** page number -> visible height (px), maintained by the same observer. */
    pageVisibilityRef: MutableRefObject<Map<number, number>>;
    /**
     * True once the user has scrolled the caret's page out of view — i.e. they
     * are browsing elsewhere. While set, the preview neither chases the caret on
     * a content change nor re-centers, and forward sync searches from the
     * viewport center instead of following the caret. Shared with
     * `usePreviewCaret`. Cleared on a preview click and when the caret's page
     * scrolls back into view.
     */
    userScrolledAwayRef: MutableRefObject<boolean>;
}

export function usePreviewSync({
    scrollRef,
    previewRevision,
    previewPages,
    dispatchAction,
    caret,
    caretRevision,
    zoom,
    anchorPageRef,
    pageVisibilityRef,
    userScrolledAwayRef,
}: UsePreviewSyncOptions) {
    const programmaticScrollRef = useRef(false);
    const lastForwardScrollKeyRef = useRef<string | null>(null);
    const prevZoomRef = useRef(zoom);
    const handledRevisionRef = useRef<number | null>(null);
    // Latest caret cue, read inside the scroll listener (whose closure is built
    // once) to decide whether the user has scrolled away from it.
    const caretRef = useRef<PreviewCaret | null>(caret);
    caretRef.current = caret;

    useEffect(() => {
        const scrollRoot = scrollRef.current;
        if (!scrollRoot) {
            return;
        }

        const onUserScroll = () => {
            if (programmaticScrollRef.current) {
                return;
            }
            // "Browsing away" = the caret's page is no longer visible. Derived
            // from the IntersectionObserver map (a cheap lookup, no measuring),
            // it self-clears when the user scrolls the caret back into view.
            const cuePage = caretRef.current?.pageNumber ?? null;
            userScrolledAwayRef.current =
                cuePage !== null && !pageVisibilityRef.current.has(cuePage);
        };

        scrollRoot.addEventListener("scroll", onUserScroll, { passive: true });
        return () => scrollRoot.removeEventListener("scroll", onUserScroll);
    }, [scrollRef, pageVisibilityRef, userScrolledAwayRef]);

    useEffect(() => {
        if (previewRevision === null) {
            return;
        }
        const scrollRoot = scrollRef.current;
        if (!scrollRoot) {
            return;
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
        // The user is browsing away from the caret — don't yank them back. Unlike
        // the old "reset on every compile", this persists across edits until they
        // scroll the caret back into view (or click the preview), so editing a
        // field while looking elsewhere keeps the view put.
        if (userScrolledAwayRef.current) {
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
            isCancelled: () => userScrolledAwayRef.current,
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
                        userScrolledAwayRef.current = false;
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
