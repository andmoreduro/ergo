import { describe, expect, it } from "vitest";
import { buildEditorFieldOrder, findNextEditorField, findPreviousEditorField } from "./fieldNavigation";
import { createDefaultDocumentAST } from "../state/ast/defaults";
import {
    projectInputFieldId,
    simpleListComposerFieldId,
} from "./fieldIds";

describe("buildEditorFieldOrder", () => {
    it("orders title, author names, composers, and list item fields", () => {
        const ast = createDefaultDocumentAST();
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

        const order = buildEditorFieldOrder(spec, "student", ast).map(
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

    it("includes object array entry fields such as authorities", () => {
        const ast = createDefaultDocumentAST();
        ast.metadata.template_id = "umb-apa";
        ast.metadata.template_variant_id = null;
        ast.inputs.authorities = [{ name: "Rector", role: "Rectoría" }];

        const spec = {
            editor: {
                inputs: [
                    { id: "title", type: "string" },
                    {
                        id: "authorities",
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
                groups: [{ id: "front", inputs: ["title", "authorities"] }],
            },
        } as unknown as Parameters<typeof buildEditorFieldOrder>[0];

        const order = buildEditorFieldOrder(spec, null, ast).map(
            (entry) => entry.fieldId,
        );

        expect(order).toEqual([
            projectInputFieldId("/title"),
            projectInputFieldId("/authorities/0/name"),
            projectInputFieldId("/authorities/0/role"),
        ]);
    });

    it("walks fields forward and backward", () => {
        const order = [
            { elementId: "a", fieldId: "a:text" },
            { elementId: "b", fieldId: "b:text" },
        ];

        expect(findNextEditorField(order, "a:text")?.fieldId).toBe("b:text");
        expect(findNextEditorField(order, "b:text")).toBeNull();
        expect(findPreviousEditorField(order, "b:text")?.fieldId).toBe("a:text");
        expect(findPreviousEditorField(order, "a:text")).toBeNull();
    });

});
