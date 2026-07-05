import { describe, expect, it } from "vitest";
import {
    buildEditorFieldOrder,
    isSimpleListEntryField,
} from "./fieldNavigation";
import { createTestDocumentAST } from "../test/documentAstFixture";
import {
    projectInputFieldId,
    simpleListComposerFieldId,
} from "./fieldIds";

describe("buildEditorFieldOrder", () => {
    it("orders title, author names, composers, and list item fields", () => {
        const ast = createTestDocumentAST();
        ast.inputs.affiliations = ["North University", "Lab B"];
        const spec = {
            editor: {
                inputs: [
                    { id: "title", type: "string" },
                    { id: "authors", type: "array" },
                    { id: "affiliations", type: "simple_list" },
                    { id: "keywords", type: "simple_list" },
                ],
                groups: [
                    {
                        id: "cover",
                        inputs: ["title", "authors", "affiliations", "keywords"],
                    },
                ],
            },
        } as unknown as Parameters<typeof buildEditorFieldOrder>[0];

        const order = buildEditorFieldOrder(spec, null, ast).map(
            (entry) => entry.fieldId,
        );

        expect(order).toEqual([
            projectInputFieldId("/title"),
            projectInputFieldId("/authors/0/name"),
            projectInputFieldId("/affiliations/0"),
            projectInputFieldId("/affiliations/1"),
            simpleListComposerFieldId("/affiliations"),
            simpleListComposerFieldId("/keywords"),
        ]);
    });

    it("includes object-array entry fields from the input schema", () => {
        const ast = createTestDocumentAST();
        ast.inputs.signatories = [{ name: "Ada", role: "Chair" }];

        const spec = {
            editor: {
                inputs: [
                    { id: "title", type: "string" },
                    {
                        id: "signatories",
                        type: "array",
                        items: {
                            type: "object",
                            properties: [
                                { id: "name", type: "string" },
                                { id: "role", type: "string" },
                            ],
                        },
                    },
                ],
                groups: [{ id: "front", inputs: ["title", "signatories"] }],
            },
        } as unknown as Parameters<typeof buildEditorFieldOrder>[0];

        const order = buildEditorFieldOrder(spec, null, ast).map(
            (entry) => entry.fieldId,
        );

        expect(order).toEqual([
            projectInputFieldId("/title"),
            projectInputFieldId("/signatories/0/name"),
            projectInputFieldId("/signatories/0/role"),
        ]);
    });

});

describe("isSimpleListEntryField", () => {
    const spec = {
        editor: {
            inputs: [
                { id: "affiliations", type: "simple_list" },
                { id: "abstract", type: "content_blocks" },
            ],
        },
    } as unknown as Parameters<typeof isSimpleListEntryField>[0];

    it("returns true for an indexed simple_list entry", () => {
        expect(isSimpleListEntryField(spec, "/affiliations/0")).toBe(true);
    });

    it("returns false for an indexed content_blocks paragraph", () => {
        expect(isSimpleListEntryField(spec, "/abstract/2")).toBe(false);
    });

    it("returns false when the base path is not a declared input", () => {
        expect(isSimpleListEntryField(spec, "/unknown/0")).toBe(false);
    });

    it("returns false for non-indexed field ids", () => {
        expect(isSimpleListEntryField(spec, "/affiliations")).toBe(false);
        expect(isSimpleListEntryField(spec, null)).toBe(false);
    });
});
