const FOCUSABLE =
    'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable="true"]';

const EXTRA_SELECTOR = '[data-wrapper-tab="extra"]';
const PRIMARY_SELECTOR = '[data-wrapper-tab="primary"]';
const IGNORE_SELECTOR = "[data-wrapper-tab-ignore]";

const focusablesIn = (container: HTMLElement): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.closest(IGNORE_SELECTOR),
    );

const sortedExtras = (root: HTMLElement): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(EXTRA_SELECTOR))
        .sort(
            (a, b) =>
                Number(a.dataset.wrapperTabIndex ?? 0) -
                Number(b.dataset.wrapperTabIndex ?? 0),
        )
        .flatMap((slot) => focusablesIn(slot));

const sortedPrimary = (root: HTMLElement): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(PRIMARY_SELECTOR)).flatMap(
        (slot) => focusablesIn(slot),
    );

/** Tab stops: primary fields (e.g. Mermaid source), then annotation extras. */
export const wrapperTabStops = (root: HTMLElement): HTMLElement[] => [
    ...sortedPrimary(root),
    ...sortedExtras(root),
];

/** Drop focus from any control inside the block host (e.g. when returning to locked mode). */
export const blurFocusedInside = (root: HTMLElement): void => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && root.contains(active)) {
        active.blur();
    }
};

/** Focus the main editable control in the block (prefers `textarea`). */
export const focusWrapperPrimary = (root: HTMLElement): boolean => {
    for (const slot of root.querySelectorAll<HTMLElement>(PRIMARY_SELECTOR)) {
        const textarea = slot.querySelector<HTMLElement>(
            "textarea:not([disabled])",
        );
        if (textarea) {
            textarea.focus();
            return true;
        }
    }

    const stops = sortedPrimary(root);
    if (stops[0]) {
        stops[0].focus();
        return true;
    }
    return false;
};

const activeStopIndex = (
    sequence: HTMLElement[],
    active: HTMLElement | null,
): number => {
    if (!active) {
        return -1;
    }
    for (let i = 0; i < sequence.length; i += 1) {
        const stop = sequence[i];
        if (stop === active || stop.contains(active)) {
            return i;
        }
    }
    return -1;
};

/**
 * Tab cycles only `wrapperTabStops` (primary + annotation fields). Settings cog
 * and extras accordion toggle are excluded via `data-wrapper-tab-ignore`.
 */
export const handleWrapperTabKeyDown = (
    event: Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault" | "stopPropagation">,
    root: HTMLElement,
): boolean => {
    if (event.key !== "Tab") {
        return false;
    }

    const stops = wrapperTabStops(root);
    if (stops.length === 0) {
        return false;
    }

    const active =
        document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
    if (!active || !root.contains(active)) {
        return false;
    }

    const forward = !event.shiftKey;
    const idx = activeStopIndex(stops, active);
    let nextIndex: number;

    if (idx === -1) {
        nextIndex = forward ? 0 : stops.length - 1;
    } else if (forward) {
        nextIndex = idx + 1 < stops.length ? idx + 1 : 0;
    } else {
        nextIndex = idx > 0 ? idx - 1 : stops.length - 1;
    }

    stops[nextIndex]?.focus();
    event.preventDefault();
    event.stopPropagation();
    return true;
};
