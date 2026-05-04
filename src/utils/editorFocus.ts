export const focusEditorElement = (elementId: string): boolean => {
    const element = document.querySelector<HTMLElement>(
        `[data-element-id="${CSS.escape(elementId)}"]`,
    );

    if (!element) {
        return false;
    }

    element.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const focusTarget =
        element.querySelector<HTMLElement>(
            [
                "textarea:not(:disabled)",
                "input:not(:disabled):not([type='button']):not([type='submit']):not([type='reset'])",
                "select:not(:disabled)",
            ].join(", "),
        ) ??
        element.querySelector<HTMLElement>(
            "button:not(:disabled), [tabindex]:not([tabindex='-1'])",
        );

    focusTarget?.focus();
    return true;
};
