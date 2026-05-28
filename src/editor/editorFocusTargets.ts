import { simpleListComposerFieldId } from "./fieldIds";

export const isEditorFieldTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        target.closest(
            "[data-editor-field-id], input, textarea, select, button, [role='dialog'], [role='menu']",
        ),
    );
};

/** Regions where leaving an editor field should not snap focus back. */
export const isEditorFocusLoseExempt = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }

    return Boolean(
        target.closest(
            "[data-editor-focus-lose-exempt], [role='dialog'], [role='menu']",
        ),
    );
};

/** When a simple-list item field is removed, focus the list composer for that path. */
export const composerFieldIdForBlurredListItem = (
    fieldId: string,
): string | null => {
    const prefix = "project-input-";
    if (!fieldId.startsWith(prefix)) {
        return null;
    }

    const path = fieldId.slice(prefix.length);
    const match = path.match(/^(.+)\/\d+$/);
    if (!match) {
        return null;
    }

    return simpleListComposerFieldId(match[1]);
};

export const fallbackFieldIdsAfterBlur = (blurredFieldId: string): string[] => {
    const composerId = composerFieldIdForBlurredListItem(blurredFieldId);
    return composerId ? [composerId] : [];
};
