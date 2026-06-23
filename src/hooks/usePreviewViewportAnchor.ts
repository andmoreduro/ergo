import {
    useEffect,
    useRef,
    type MutableRefObject,
    type RefObject,
} from "react";
import { anchorPageFromVisibility } from "../preview/previewScroll";
import type { PreviewPageDescriptor } from "./usePreviewSync";

// IntersectionObserver thresholds at 5% steps so the visible-height map updates
// as pages scroll through the viewport without a callback per scrolled pixel.
const PAGE_VISIBILITY_THRESHOLDS = Array.from(
    { length: 21 },
    (_, index) => index / 20,
);

export interface PreviewViewportAnchor {
    /** Page occupying most of the viewport — the page the user is looking at. */
    anchorPageRef: MutableRefObject<number | null>;
    /** Page the vertical center of the viewport falls inside (or nearest). */
    centerPageRef: MutableRefObject<number | null>;
    /** page number -> visible height (px), maintained by the observer. */
    pageVisibilityRef: MutableRefObject<Map<number, number>>;
}

/**
 * Track the preview viewport's page geometry with a single IntersectionObserver,
 * so consumers (forward-sync resolution, content-change scroll fallback) read
 * cheap refs instead of a `getBoundingClientRect` sweep over every page — that
 * sweep forced a full preview reflow on every keystroke. The observer reports
 * each page's `boundingClientRect`/`rootBounds`, so the center page is derived
 * for free here rather than re-measured by readers. Shared between
 * `usePreviewCaret` and `usePreviewSync` so the observer is built once.
 */
export function usePreviewViewportAnchor(
    scrollRef: RefObject<HTMLElement | null>,
    previewPages: readonly PreviewPageDescriptor[],
): PreviewViewportAnchor {
    const anchorPageRef = useRef<number | null>(null);
    const centerPageRef = useRef<number | null>(null);
    const pageVisibilityRef = useRef<Map<number, number>>(new Map());

    // Stable while the set of page numbers is unchanged (the common case while
    // typing), so the observer is only rebuilt when pages are added or removed.
    const pageNumbersKey = previewPages
        .map((page) => page.page_number)
        .join(",");

    useEffect(() => {
        const scrollRoot = scrollRef.current;
        if (!scrollRoot || typeof IntersectionObserver === "undefined") {
            return;
        }

        const visibility = pageVisibilityRef.current;
        // Latest viewport-relative box of each visible page, so the center page
        // can be recomputed without measuring the DOM again.
        const pageRects = new Map<number, { top: number; bottom: number }>();

        const recomputeCenter = (rootCenterY: number) => {
            let center: number | null = null;
            let bestDistance = Number.POSITIVE_INFINITY;
            for (const [pageNumber, rect] of pageRects) {
                if (rootCenterY >= rect.top && rootCenterY <= rect.bottom) {
                    centerPageRef.current = pageNumber;
                    return;
                }
                const distance =
                    rootCenterY < rect.top
                        ? rect.top - rootCenterY
                        : rootCenterY - rect.bottom;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    center = pageNumber;
                }
            }
            if (center !== null) {
                centerPageRef.current = center;
            }
        };

        const observer = new IntersectionObserver(
            (entries) => {
                let rootCenterY: number | null = null;
                for (const entry of entries) {
                    const element = entry.target as HTMLElement;
                    const pageNumber = Number(element.dataset.previewPageNumber);
                    if (!Number.isFinite(pageNumber)) {
                        continue;
                    }
                    if (entry.rootBounds) {
                        rootCenterY =
                            entry.rootBounds.top + entry.rootBounds.height / 2;
                    }
                    if (
                        entry.isIntersecting &&
                        entry.intersectionRect.height > 0
                    ) {
                        visibility.set(pageNumber, entry.intersectionRect.height);
                        pageRects.set(pageNumber, {
                            top: entry.boundingClientRect.top,
                            bottom: entry.boundingClientRect.bottom,
                        });
                    } else {
                        visibility.delete(pageNumber);
                        pageRects.delete(pageNumber);
                    }
                }
                const anchor = anchorPageFromVisibility(visibility);
                if (anchor !== null) {
                    anchorPageRef.current = anchor;
                }
                if (rootCenterY !== null) {
                    recomputeCenter(rootCenterY);
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

    return { anchorPageRef, centerPageRef, pageVisibilityRef };
}
