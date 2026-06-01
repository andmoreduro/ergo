import {
    backendInputsElementId,
    isTemplateFormFieldId,
    projectInputElementId,
} from "./fieldIds";

export interface RememberedBodyFocus {
    elementId: string;
    fieldId: string;
    caretUtf16Offset: number;
}

let lastBodyFocus: RememberedBodyFocus | null = null;
let lastTemplateFieldId: string | null = null;

const isBodyContentElementId = (elementId: string): boolean =>
    elementId !== projectInputElementId &&
    elementId !== backendInputsElementId;

export const rememberBodyFocus = (focus: RememberedBodyFocus): void => {
    if (!isBodyContentElementId(focus.elementId)) {
        return;
    }
    lastBodyFocus = focus;
};

export const rememberTemplateFieldFocus = (fieldId: string): void => {
    if (isTemplateFormFieldId(fieldId)) {
        lastTemplateFieldId = fieldId;
    }
};

export const getLastBodyFocus = (): RememberedBodyFocus | null => lastBodyFocus;

export const getLastTemplateFieldId = (): string | null => lastTemplateFieldId;

/** @internal */
export const resetEditorFocusMemoryForTests = (): void => {
    lastBodyFocus = null;
    lastTemplateFieldId = null;
};
