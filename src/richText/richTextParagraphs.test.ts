import { describe, expect, it } from "vitest";
import {
    parseRichTextParagraphsFromEditableRoot,
    renderRichTextParagraphsToEditableHtml,
} from "./richText";
import { createRichText } from "../state/ast/defaults";

describe("parseRichTextParagraphsFromEditableRoot", () => {
    it("keeps a trailing empty paragraph while editing", () => {
        const root = document.createElement("div");
        root.innerHTML = renderRichTextParagraphsToEditableHtml([
            [createRichText("First")],
            [],
        ]);

        const parsed = parseRichTextParagraphsFromEditableRoot(root, {
            keepTrailingEmptyParagraph: true,
        });

        expect(parsed).toHaveLength(2);
        expect(parsed[1]?.map((span) => span.text).join("")).toBe("");
    });

    it("drops a trailing empty paragraph when finalizing", () => {
        const root = document.createElement("div");
        root.innerHTML = renderRichTextParagraphsToEditableHtml([
            [createRichText("First")],
            [],
        ]);

        const parsed = parseRichTextParagraphsFromEditableRoot(root);

        expect(parsed).toHaveLength(1);
    });
});
