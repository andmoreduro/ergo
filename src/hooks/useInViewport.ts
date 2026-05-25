import { useEffect, useState, type RefObject } from "react";

export interface UseInViewportOptions {
    /** IntersectionObserver root (scroll container). */
    rootRef: RefObject<Element | null>;
    /** Expand the observed region so pages rasterize slightly before they enter view. */
    rootMargin?: string;
    /** When true, the target is always treated as visible (e.g. sync caret page). */
    forceVisible?: boolean;
}

/**
 * Reports whether `targetRef` intersects the scrollport defined by `rootRef`.
 */
export function useInViewport(
    targetRef: RefObject<Element | null>,
    { rootRef, rootMargin = "240px 0px", forceVisible = false }: UseInViewportOptions,
): boolean {
    const [isVisible, setIsVisible] = useState(forceVisible);

    useEffect(() => {
        if (forceVisible) {
            setIsVisible(true);
            return;
        }

        const target = targetRef.current;
        const root = rootRef.current;
        if (!target || !root) {
            setIsVisible(false);
            return;
        }

        if (typeof IntersectionObserver === "undefined") {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            { root, rootMargin, threshold: 0 },
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [forceVisible, rootMargin, rootRef, targetRef]);

    return forceVisible || isVisible;
}
