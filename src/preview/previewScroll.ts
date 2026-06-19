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

/**
 * Scroll the preview so the forward-sync caret is in view. The page's CSS-per-pt
 * scale is read from the rendered page box (so zoom/fit need not be threaded in).
 * Unless `forceCenter` is set, a caret already comfortably inside the viewport is
 * left undisturbed, so typing within the visible area never jitters the view.
 */
export function scrollPreviewToCaret(
    scrollRoot: HTMLElement,
    caret: { pageNumber: number; topYPt: number; heightPt: number },
    options?: { forceCenter?: boolean; behavior?: ScrollBehavior },
): boolean {
    const page = scrollRoot.querySelector<HTMLElement>(
        `[data-preview-page-number="${caret.pageNumber}"]`,
    );
    if (!page) {
        return false;
    }
    const surface =
        page.querySelector<HTMLElement>('[data-preview-page-surface="true"]') ??
        page;
    const content = page.querySelector<HTMLElement>(
        "[data-preview-page-content]",
    );
    const heightPt = Number(content?.dataset.pageHeightPt);
    const pageRect = surface.getBoundingClientRect();
    if (!Number.isFinite(heightPt) || heightPt <= 0 || pageRect.height <= 0) {
        return false;
    }

    const cssPerPt = pageRect.height / heightPt;
    const rootRect = scrollRoot.getBoundingClientRect();
    const caretTop = pageRect.top - rootRect.top + caret.topYPt * cssPerPt;
    const caretHeight = caret.heightPt * cssPerPt;

    if (!options?.forceCenter) {
        const margin = Math.min(rootRect.height * 0.25, 96);
        if (
            caretTop >= margin &&
            caretTop + caretHeight <= rootRect.height - margin
        ) {
            return true;
        }
    }

    const targetTop =
        scrollRoot.scrollTop + caretTop + caretHeight / 2 - rootRect.height / 2;
    scrollRoot.scrollTo({
        top: Math.max(0, targetTop),
        behavior: options?.behavior ?? "instant",
    });
    return true;
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
 * Page number occupying the largest share of the preview viewport, selected from
 * an IntersectionObserver-maintained map of page number -> visible height (px).
 * Replaces a per-revision `getBoundingClientRect` sweep over every page that
 * forced a full preview-column reflow on every keystroke.
 */
export function anchorPageFromVisibility(
    visibility: Map<number, number>,
): number | null {
    let bestPage: number | null = null;
    let bestVisible = 0;

    for (const [pageNumber, visible] of visibility) {
        if (visible > bestVisible) {
            bestVisible = visible;
            bestPage = pageNumber;
        }
    }

    return bestPage;
}

/**
 * Page whose rendered box contains (or lies nearest to) the vertical center of
 * the preview viewport — i.e. the page the user is actually looking at. Used to
 * anchor forward-sync resolution so a field rendered in several spots resolves to
 * the copy on the current page, not whichever copy the caret last sat on.
 */
export function pageNumberAtViewportCenter(
    scrollRoot: HTMLElement,
): number | null {
    const rootRect = scrollRoot.getBoundingClientRect();
    const centerY = rootRect.top + rootRect.height / 2;
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const element of scrollRoot.querySelectorAll<HTMLElement>(
        "[data-preview-page-number]",
    )) {
        const pageNumber = Number(element.dataset.previewPageNumber);
        if (!Number.isFinite(pageNumber)) {
            continue;
        }
        const rect = element.getBoundingClientRect();
        if (centerY >= rect.top && centerY <= rect.bottom) {
            return pageNumber;
        }
        const distance =
            centerY < rect.top ? rect.top - centerY : centerY - rect.bottom;
        if (distance < bestDistance) {
            bestDistance = distance;
            best = pageNumber;
        }
    }

    return best;
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
