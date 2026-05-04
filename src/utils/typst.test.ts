import { describe, expect, it } from "vitest";
import { createDefaultDocumentAST } from "../state/ast/defaults";
import { astReducer } from "../state/ast/reducer";
import { escapeTypstText, generateTypst, generateTypstWithSourceMap } from "./typst";

describe("Typst source generation", () => {
    it("escapes Typst control characters in user text", () => {
        expect(escapeTypstText("#hello_[x]")).toBe("\\#hello\\_\\[x\\]");
    });

    it("generates labeled source for headings, paragraphs, and tables", () => {
        const state = createDefaultDocumentAST();
        const content = state.sections.find((section) => section.type === "Content");
        expect(content?.type).toBe("Content");

        const withHeading = astReducer(state, {
            type: "ADD_HEADING",
            payload: {
                sectionId: content?.type === "Content" ? content.id : "",
                headingId: "heading-1",
                level: 2,
            },
        });
        const withParagraph = astReducer(withHeading, {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId: content?.type === "Content" ? content.id : "",
                paragraphId: "paragraph-1",
            },
        });
        const withText = astReducer(withParagraph, {
            type: "UPDATE_PARAGRAPH_TEXT",
            payload: {
                paragraphId: "paragraph-1",
                text: "A paragraph with #markup.",
            },
        });
        const withTable = astReducer(withText, {
            type: "ADD_TABLE",
            payload: {
                sectionId: content?.type === "Content" ? content.id : "",
                tableId: "table-1",
            },
        });

        const source = generateTypst(withTable);

        expect(source).toContain("== Untitled heading <ergo-heading-1>");
        expect(source).toContain("A paragraph with \\#markup. <ergo-paragraph-1>");
        expect(source).toContain("#table(");
        expect(source).toContain("<ergo-table-1>");
    });

    it("returns source-map entries for generated document elements", () => {
        const state = createDefaultDocumentAST();
        const content = state.sections.find((section) => section.type === "Content");
        const withParagraph = astReducer(state, {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId: content?.type === "Content" ? content.id : "",
                paragraphId: "paragraph-1",
            },
        });
        const withText = astReducer(withParagraph, {
            type: "UPDATE_PARAGRAPH_TEXT",
            payload: {
                paragraphId: "paragraph-1",
                text: "Mapped text",
            },
        });

        const generated = generateTypstWithSourceMap(withText);

        expect(generated.sourceMap).toEqual([
            expect.objectContaining({
                elementId: "paragraph-1",
                label: "ergo-paragraph-1",
            }),
        ]);
        expect(generated.source.slice(
            generated.sourceMap[0].start,
            generated.sourceMap[0].end,
        )).toContain("Mapped text");
    });
});
