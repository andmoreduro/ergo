import { describe, expect, it } from "vitest";
import { convertElement } from "./convertElement";
import { createRichText } from "./defaults";

describe("convertElement", () => {
    it("preserves requested heading level when promoting a paragraph", () => {
        const converted = convertElement(
            {
                type: "Paragraph",
                id: "p1",
                content: [createRichText("Intro")],
            },
            "Heading",
            { headingLevel: 4 },
        );
        expect(converted).toEqual({
            type: "Heading",
            id: "p1",
            level: 4,
            content: [createRichText("Intro")],
        });
    });

    it("defaults to heading level 2 when no level is requested", () => {
        const converted = convertElement(
            { type: "Paragraph", id: "p2", content: [] },
            "Heading",
        );
        expect(converted).toEqual({
            type: "Heading",
            id: "p2",
            level: 2,
            content: [],
        });
    });

    it("extracts equation latex source as rich text", () => {
        const converted = convertElement(
            {
                type: "Equation",
                id: "eq1",
                latex_source: "E = mc^2",
                is_block: true,
                syntax: "typst",
            },
            "Paragraph",
        );
        expect(converted).toEqual({
            type: "Paragraph",
            id: "eq1",
            content: [createRichText("E = mc^2")],
        });
    });

    it("joins list item content with newline rich text when flattening to a paragraph", () => {
        const converted = convertElement(
            {
                type: "List",
                id: "list1",
                items: [
                    { content: [createRichText("First")], children: [] },
                    {
                        content: [createRichText("Second"), createRichText("part")],
                        children: [],
                    },
                ],
            },
            "Paragraph",
        );
        expect(converted).toEqual({
            type: "Paragraph",
            id: "list1",
            content: [
                createRichText("First"),
                createRichText("\n"),
                createRichText("Second"),
                createRichText("part"),
            ],
        });
    });

    it.each([
        { kind: "List" as const },
        { kind: "Enumeration" as const },
    ])(
        "wraps paragraph content in a list item so $kind → Paragraph round-trips",
        ({ kind }) => {
            const paragraph = {
                type: "Paragraph" as const,
                id: "p3",
                content: [createRichText("Alpha"), createRichText("beta")],
            };

            const list = convertElement(paragraph, kind);
            expect(list).toEqual({
                type: kind,
                id: "p3",
                items: [{ content: paragraph.content, children: [] }],
            });

            expect(convertElement(list, "Paragraph")).toEqual(paragraph);
        },
    );

    it("extracts a paragraph figure body as rich text", () => {
        const converted = convertElement(
            {
                type: "Figure",
                id: "fig1",
                asset_id: null,
                content: {
                    type: "Paragraph",
                    id: "fig1-body",
                    content: [createRichText("Body text")],
                },
                caption: "",
                placement: "",
                extra_fields: {},
            },
            "Quote",
        );
        expect(converted).toEqual({
            type: "Quote",
            id: "fig1",
            attribution_text: null,
            attribution_reference_id: null,
            content: [createRichText("Body text")],
        });
    });
});
