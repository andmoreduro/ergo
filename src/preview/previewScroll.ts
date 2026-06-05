const PAGE_SCROLL_RETRY_FRAMES = 8;

/** Pick the changed page nearest the current viewport anchor. */
export function closestChangedPageNumber(
    changedPages: number[],
    anchorPage: number | null,
): number | null {
    if (changedPages.length === 0) {
        return null;
    }
    if (anchorPage === null) {
        return Math.min(...changedPages);
    }

    let best = changedPages[0];
    let bestDistance = Math.abs(best - anchorPage);
    for (let index = 1; index < changedPages.length; index += 1) {
        const page = changedPages[index];
        const distance = Math.abs(page - anchorPage);
        if (distance < bestDistance) {
            best = page;
            bestDistance = distance;
        }
    }
    return best;
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
        behavior: "instant",
    });
    return true;
}

/**
 * Page number whose content occupies the largest share of the preview viewport.
 * Used as the anchor when scrolling to the nearest changed page after compile.
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

/** Scroll to a page, retrying until the page node exists in the DOM. */
export function schedulePreviewPageScroll(
    scrollRoot: HTMLElement,
    pageNumber: number,
    options?: {
        lastScrollKeyRef?: { current: string | null };
        scrollKey?: string;
        maxAttempts?: number;
        isCancelled?: () => boolean;
    },
): void {
    const maxAttempts = options?.maxAttempts ?? PAGE_SCROLL_RETRY_FRAMES;
    const lastScrollKeyRef = options?.lastScrollKeyRef;
    const scrollKey = options?.scrollKey;

    const attempt = (remaining: number) => {
        if (options?.isCancelled?.()) {
            return;
        }
        if (
            lastScrollKeyRef &&
            scrollKey &&
            lastScrollKeyRef.current === scrollKey
        ) {
            return;
        }

        const scrolled = scrollPreviewToPage(scrollRoot, pageNumber);
        if (scrolled) {
            if (lastScrollKeyRef && scrollKey) {
                lastScrollKeyRef.current = scrollKey;
            }
            return;
        }
        if (remaining <= 0) {
            return;
        }
        requestAnimationFrame(() => attempt(remaining - 1));
    };

    attempt(maxAttempts);
}
