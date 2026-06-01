import { describe, expect, it } from "vitest";
import {
    getLastBodyFocus,
    getLastTemplateFieldId,
    rememberBodyFocus,
    rememberTemplateFieldFocus,
    resetEditorFocusMemoryForTests,
} from "./editorFocusMemory";
import { projectInputFieldId, projectInputElementId } from "./fieldIds";

describe("editorFocusMemory", () => {
    it("remembers body focus but not project inputs", () => {
        resetEditorFocusMemoryForTests();
        rememberBodyFocus({
            elementId: "eq-1",
            fieldId: "eq-1:latexSource",
            caretUtf16Offset: 3,
        });
        rememberBodyFocus({
            elementId: projectInputElementId,
            fieldId: projectInputFieldId("/title"),
            caretUtf16Offset: 0,
        });
        expect(getLastBodyFocus()).toEqual({
            elementId: "eq-1",
            fieldId: "eq-1:latexSource",
            caretUtf16Offset: 3,
        });
    });

    it("remembers the last focused template field id", () => {
        resetEditorFocusMemoryForTests();
        rememberTemplateFieldFocus(projectInputFieldId("/title"));
        rememberTemplateFieldFocus(projectInputFieldId("/abstract"));
        expect(getLastTemplateFieldId()).toBe(
            projectInputFieldId("/abstract"),
        );
    });
});
