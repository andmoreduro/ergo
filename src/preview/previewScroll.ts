import {
    resolvePreviewPageMetrics,
    type PagePtMetrics,
} from "./previewPageMetrics";

export type CaretScrollPosition = {
    pageNumber: number;
    xPt: number;
    caretCue: { topYPt: number; heightPt: number };
};

const CARET_SCROLL_RETRY_FRAMES = 8;

function pageContentRect(pageElement: HTMLElement): DOMRect | null {
    const surface = pageElement.querySelector<HTMLElement>(
        "[data-preview-page-surface]",
    );
    if (surface) {
        const rect = surface.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            return rect;
        }
    }

    return null;
}

/**
 * Scroll the preview container so the sync caret is centered when possible,
 * clamped to scroll bounds. Uses Typst-point geometry on the page surface so it
 * works before the caret DOM node exists and after zoom changes.
 */
export function scrollPreviewToCaretPosition(
    scrollRoot: HTMLElement,
    position: CaretScrollPosition,
    options?: { fallbackMetrics?: PagePtMetrics | null },
): boolean {
    const page = scrollRoot.querySelector<HTMLElement>(
        `[data-preview-page-number="${position.pageNumber}"]`,
    );
    if (!page) {
        return false;
    }

    const metrics = resolvePreviewPageMetrics(page, options?.fallbackMetrics);
    if (!metrics) {
        return false;
    }

    const contentRect = pageContentRect(page);
    if (!contentRect) {
        return false;
    }

    const rootRect = scrollRoot.getBoundingClientRect();
    const pageTop = contentRect.top - rootRect.top + scrollRoot.scrollTop;
    const pageLeft = contentRect.left - rootRect.left + scrollRoot.scrollLeft;

    const caretTop =
        pageTop +
        (position.caretCue.topYPt / metrics.heightPt) * contentRect.height;
    const caretBottom =
        pageTop +
        ((position.caretCue.topYPt + position.caretCue.heightPt) /
            metrics.heightPt) *
            contentRect.height;
    const caretCenterY = (caretTop + caretBottom) / 2;
    const caretCenterX =
        pageLeft + (position.xPt / metrics.widthPt) * contentRect.width;

    const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
    const maxLeft = Math.max(0, scrollRoot.scrollWidth - scrollRoot.clientWidth);

    const targetTop = Math.min(
        maxTop,
        Math.max(0, caretCenterY - scrollRoot.clientHeight / 2),
    );
    const targetLeft = Math.min(
        maxLeft,
        Math.max(0, caretCenterX - scrollRoot.clientWidth / 2),
    );

    scrollRoot.scrollTop = targetTop;
    scrollRoot.scrollLeft = targetLeft;
    return true;
}

/**
 * Scroll to the caret, retrying across animation frames until layout is ready.
 */
export function schedulePreviewCaretScroll(
    scrollRoot: HTMLElement,
    position: CaretScrollPosition,
    options: {
        force?: boolean;
        lastScrollKeyRef: { current: string | null };
        scrollKey: string;
        fallbackMetrics?: PagePtMetrics | null;
        maxAttempts?: number;
        /** When true, abort pending scroll retries (e.g. user scrolled manually). */
        isCancelled?: () => boolean;
    },
): void {
    const maxAttempts = options.maxAttempts ?? CARET_SCROLL_RETRY_FRAMES;
    const { force = false, lastScrollKeyRef, scrollKey } = options;

    const attempt = (remaining: number) => {
        if (options.isCancelled?.()) {
            return;
        }
        if (!force && lastScrollKeyRef.current === scrollKey) {
            return;
        }

        const scrolled = scrollPreviewToCaretPosition(scrollRoot, position, {
            fallbackMetrics: options.fallbackMetrics,
        });
        if (scrolled) {
            lastScrollKeyRef.current = scrollKey;
            return;
        }
        if (remaining <= 0) {
            return;
        }
        requestAnimationFrame(() => attempt(remaining - 1));
    };

    attempt(maxAttempts);
}

/** Stable focus target for deciding when to auto-scroll (excludes caret offset). */
export function focusScrollIdentity(
    sourceRevision: number,
    elementId: string | null,
    fieldId: string | null,
): string {
    return [sourceRevision, elementId ?? "", fieldId ?? ""].join("|");
}

/** Scroll the preview so the given page is near the top of the viewport. */
export function scrollPreviewToPage(
    scrollRoot: HTMLElement,
    pageNumber: number,
): boolean {
    const page = scrollRoot.querySelector<HTMLElement>(
        `[data-preview-page-number="${pageNumber}"]`,
    );
    if (!page) {
        return false;
    }

    const pageRect = page.getBoundingClientRect();
    const rootRect = scrollRoot.getBoundingClientRect();
    const targetTop =
        scrollRoot.scrollTop + (pageRect.top - rootRect.top) - 16;
    scrollRoot.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
    });
    return true;
}

/**
 * Page number whose content occupies the largest share of the preview viewport.
 * Used to break ties when a field appears on multiple pages.
 */
export function previewAnchorPageFromScroll(scrollRoot: HTMLElement): number | null {
    const rootRect = scrollRoot.getBoundingClientRect();
    const viewportTop = rootRect.top;
    const viewportBottom = rootRect.bottom;
    let bestPage: number | null = null;
    let bestVisible = 0;

    for (const page of scrollRoot.querySelectorAll<HTMLElement>(
        "[data-preview-page-number]",
    )) {
        const pageNumber = Number(page.dataset.previewPageNumber);
        if (!Number.isFinite(pageNumber)) {
            continue;
        }

        const rect = page.getBoundingClientRect();
        const visibleTop = Math.max(rect.top, viewportTop);
        const visibleBottom = Math.min(rect.bottom, viewportBottom);
        const visible = Math.max(0, visibleBottom - visibleTop);
        if (visible > bestVisible) {
            bestVisible = visible;
            bestPage = pageNumber;
        }
    }

    return bestPage;
}

export function caretScrollKey(position: {
    pageNumber: number;
    elementId: string | null;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    xPt?: number;
    caretCue: { topYPt: number; heightPt: number } | null;
    sourceRevision?: number;
}): string {
    const cue = position.caretCue;
    return [
        position.sourceRevision ?? "",
        position.pageNumber,
        position.elementId ?? "",
        position.fieldId ?? "",
        position.caretUtf16Offset ?? "",
        cue
            ? `${cue.topYPt}:${cue.heightPt}:${position.xPt ?? ""}`
            : "",
    ].join("|");
}
