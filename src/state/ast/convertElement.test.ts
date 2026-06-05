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
});
