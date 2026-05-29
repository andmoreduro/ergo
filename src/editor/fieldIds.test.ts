import { describe, expect, it } from "vitest";
import { editorFocusIdsForBackendField } from "./fieldIds";

describe("editorFocusIdsForBackendField", () => {
    it("maps backend template input paths to project input field ids", () => {
        expect(
            editorFocusIdsForBackendField("inputs", "/abstract_text"),
        ).toEqual({
            elementId: "project",
            fieldId: "project-input-/abstract_text",
        });
    });

    it("passes through non-input element and field ids", () => {
        expect(
            editorFocusIdsForBackendField("heading-1", "heading-1:text"),
        ).toEqual({
            elementId: "heading-1",
            fieldId: "heading-1:text",
        });
    });
});
