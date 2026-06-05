import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isFocusableVisible = (element: HTMLElement): boolean => {
    if (element.closest("[hidden]")) {
        return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
};

const focusableElements = (container: HTMLElement): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        isFocusableVisible,
    );

/**
 * Keeps keyboard focus inside a container while active. Focuses the first
 * focusable control on mount and restores the prior focus on cleanup.
 */
export const useFocusTrap = (
    containerRef: RefObject<HTMLElement | null>,
    active = true,
): void => {
    const restoreFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!active) {
            return;
        }
        const container = containerRef.current;
        if (!container) {
            return;
        }

        restoreFocusRef.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

        const focusFirst = () => {
            const elements = focusableElements(container);
            if (elements.length > 0) {
                elements[0].focus();
                return;
            }
            if (container.tabIndex < 0) {
                container.tabIndex = -1;
            }
            container.focus();
        };

        requestAnimationFrame(focusFirst);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Tab") {
                return;
            }
            const elements = focusableElements(container);
            if (elements.length === 0) {
                return;
            }

            const first = elements[0];
            const last = elements[elements.length - 1];
            const current = document.activeElement;

            if (event.shiftKey) {
                if (current === first || !container.contains(current)) {
                    event.preventDefault();
                    last.focus();
                }
                return;
            }

            if (current === last) {
                event.preventDefault();
                first.focus();
            }
        };

        container.addEventListener("keydown", onKeyDown);
        return () => {
            container.removeEventListener("keydown", onKeyDown);
            restoreFocusRef.current?.focus();
        };
    }, [active, containerRef]);
};
