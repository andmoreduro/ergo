import { describe, expect, it } from "vitest";
import { buildEditorFieldOrder } from "./fieldNavigation";
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
        } as Parameters<typeof buildEditorFieldOrder>[0];

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
});
