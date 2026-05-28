export const CONTENT_SECTION_SELECTOR = "[data-content-section]";
export const CONTENT_ELEMENT_BLOCK_SELECTOR = "[data-element-id]";
export const EDITOR_FIELD_SELECTOR = "[data-editor-field-id]";

const FOCUS_DELEGATION_IGNORE_SELECTOR =
    "button, a, [role='dialog'], [role='menu'], input, textarea, select";

export const closestElementBlock = (
    container: HTMLElement,
    clientX: number,
    clientY: number,
): HTMLElement | null => {
    const blocks = container.querySelectorAll<HTMLElement>(
        CONTENT_ELEMENT_BLOCK_SELECTOR,
    );
    let closest: HTMLElement | null = null;
    let closestDistance = Infinity;

    for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        const dx =
            clientX < rect.left
                ? rect.left - clientX
                : clientX > rect.right
                  ? clientX - rect.right
                  : 0;
        const dy =
            clientY < rect.top
                ? rect.top - clientY
                : clientY > rect.bottom
                  ? clientY - rect.bottom
                  : 0;
        const distance = dx * dx + dy * dy;
        if (distance < closestDistance) {
            closestDistance = distance;
            closest = block;
        }
    }

    return closest;
};

export const firstEditorFieldInBlock = (
    block: HTMLElement,
): HTMLElement | null => block.querySelector<HTMLElement>(EDITOR_FIELD_SELECTOR);

/** Empty paper clicks in the main content section (not an existing field). */
export const isContentSectionPointerFocusTarget = (
    target: EventTarget | null,
): target is HTMLElement => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return (
        Boolean(target.closest(CONTENT_SECTION_SELECTOR)) &&
        isContentSectionFocusDelegationTarget(target)
    );
};

export const isContentSectionFocusDelegationTarget = (
    target: EventTarget | null,
): target is HTMLElement => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    if (target.closest(EDITOR_FIELD_SELECTOR)) {
        return false;
    }

    if (target.closest(FOCUS_DELEGATION_IGNORE_SELECTOR)) {
        return false;
    }

    return true;
};

export const focusClosestContentField = (
    section: HTMLElement,
    target: HTMLElement,
    clientX: number,
    clientY: number,
): boolean => {
    const block =
        target.closest<HTMLElement>(CONTENT_ELEMENT_BLOCK_SELECTOR) ??
        closestElementBlock(section, clientX, clientY);
    if (!block) {
        return false;
    }

    const field = firstEditorFieldInBlock(block);
    if (!field) {
        return false;
    }

    field.focus();
    return true;
};
