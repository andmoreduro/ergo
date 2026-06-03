import { describe, expect, it } from "vitest";
import {
    backendFocusIdsForEditorField,
    editorFocusIdsForBackendField,
    elementAnnotationFieldId,
} from "./fieldIds";

describe("editorFocusIdsForBackendField", () => {
    it("maps backend template input paths to project input field ids", () => {
        expect(
            editorFocusIdsForBackendField("inputs", "/abstract_text"),
        ).toEqual({
            elementId: "project",
            fieldId: "project-input-/abstract_text",
        });
    });

    it("collapses indexed content_blocks paths to the editor field id", () => {
        expect(
            editorFocusIdsForBackendField("inputs", "/abstract_es/2"),
        ).toEqual({
            elementId: "project",
            fieldId: "project-input-/abstract_es",
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

describe("elementAnnotationFieldId", () => {
    it("maps figure and diagram captions to the Typst source-map id", () => {
        expect(elementAnnotationFieldId("fig-1", "Figure", "caption")).toBe(
            "fig-1:caption",
        );
        expect(elementAnnotationFieldId("diag-1", "Diagram", "caption")).toBe(
            "diag-1:caption",
        );
    });

    it("keeps table annotation fields on extra-field ids", () => {
        expect(elementAnnotationFieldId("tbl-1", "Table", "caption")).toBe(
            "tbl-1:extra:caption",
        );
    });
});

describe("backendFocusIdsForEditorField", () => {
    it("maps legacy extra caption ids for figure sync", () => {
        expect(
            backendFocusIdsForEditorField("fig-1", "fig-1:extra:caption"),
        ).toEqual({
            elementId: "fig-1",
            fieldId: "fig-1:caption",
        });
    });
});
