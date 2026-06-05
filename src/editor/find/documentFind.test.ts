import { describe, expect, it } from "vitest";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { TemplateSpec } from "../../bindings/TemplateSpec";
import {
    collectDocumentFindMatches,
    fieldSearchText,
    nextDocumentFindMatchIndex,
} from "./documentFind";
import { projectInputElementId, projectInputFieldId } from "../fieldIds";

const baseAst = (): DocumentAST => ({
    version: "1.0",
    metadata: {
        template_id: "fixture-template",
        template_variant_id: null,
        title: "Test",
        running_head: null,
        keywords: [],
        project_settings: {},
        local_overrides: {},
    },
    dependencies: { packages: [] },
    references: [],
    assets: [],
    inputs: {
        title: "Thesis title",
        summary: "Summary body",
    },
    sections: [
        {
            type: "Content",
            id: "body",
            is_optional: false,
            elements: [
                {
                    type: "Paragraph",
                    id: "p-1",
                    content: [
                        {
                            text: "Body paragraph text",
                            kind: null,
                            bold: null,
                            italic: null,
                            underline: null,
                            reference_id: null,
                            equation_source: null,
                            equation_syntax: "typst",
                        },
                    ],
                },
            ],
        },
    ],
});

describe("fieldSearchText", () => {
    it("reads template input strings", () => {
        const ast = baseAst();
        expect(
            fieldSearchText(ast, {
                elementId: projectInputElementId,
                fieldId: projectInputFieldId("/title"),
            }),
        ).toBe("Thesis title");
    });

    it("reads body paragraph text", () => {
        const ast = baseAst();
        expect(
            fieldSearchText(ast, {
                elementId: "p-1",
                fieldId: "p-1:text",
            }),
        ).toBe("Body paragraph text");
    });
});

const minimalFindSpec = {
    editor: {
        inputs: [{ id: "title", type: "string" }],
        groups: [{ id: "cover", inputs: ["title"] }],
        variants: [],
        custom_elements: [],
        defaults: null,
        quote_policy: null,
        options: [],
    },
} as unknown as TemplateSpec;

describe("collectDocumentFindMatches", () => {
    it("finds matches in spec-defined project inputs", () => {
        const ast = baseAst();
        const matches = collectDocumentFindMatches(
            ast,
            minimalFindSpec,
            null,
            "Thesis",
        );
        expect(
            matches.some(
                (match) => match.fieldId === projectInputFieldId("/title"),
            ),
        ).toBe(true);
    });

    it("finds matches in body fields", () => {
        const ast = baseAst();
        const matches = collectDocumentFindMatches(
            ast,
            null,
            null,
            "paragraph",
        );
        expect(
            matches.some((match) => match.fieldId === "p-1:text"),
        ).toBe(true);
    });
});

describe("nextDocumentFindMatchIndex", () => {
    it("advances to the next field after the current anchor", () => {
        const order = [
            {
                elementId: projectInputElementId,
                fieldId: "project-input-/title",
            },
            { elementId: "p-1", fieldId: "p-1:text" },
        ];
        const matches = [
            {
                elementId: projectInputElementId,
                fieldId: "project-input-/title",
                start: 0,
                end: 5,
            },
            {
                elementId: "p-1",
                fieldId: "p-1:text",
                start: 5,
                end: 13,
            },
        ];
        const index = nextDocumentFindMatchIndex(
            matches,
            order,
            {
                elementId: projectInputElementId,
                fieldId: "project-input-/title",
                offset: 5,
            },
            1,
        );
        expect(index).toBe(1);
    });
});
