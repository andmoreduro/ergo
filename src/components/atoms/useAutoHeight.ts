import {
    useCallback,
    useLayoutEffect,
    type RefObject,
} from "react";

/**
 * Keeps a textarea or contenteditable's inline height matched to `scrollHeight`.
 * Always observes layout-box resizes (window/column width changes). Pass
 * `remeasureDeps` when React updates the DOM from props (e.g. controlled textarea
 * value). Content synced manually in a layout effect should call the returned
 * `adjust` after updating the DOM instead of relying on `remeasureDeps`.
 */
export function useAutoHeight(
    ref: RefObject<HTMLElement | null>,
    remeasureDeps?: readonly unknown[],
): () => void {
    const adjust = useCallback(() => {
        const node = ref.current;
        if (!node) {
            return;
        }
        node.style.height = "auto";
        node.style.height = `${node.scrollHeight}px`;
    }, [ref]);

    useLayoutEffect(() => {
        if (remeasureDeps === undefined) {
            return;
        }
        adjust();
    }, [adjust, ...(remeasureDeps ?? [])]);

    useLayoutEffect(() => {
        const node = ref.current;
        if (!node || typeof ResizeObserver === "undefined") {
            return;
        }
        const observer = new ResizeObserver(() => {
            adjust();
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [adjust, ref]);

    return adjust;
}
