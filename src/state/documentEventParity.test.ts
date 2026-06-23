/**
 * Cross-stack event-application parity contract.
 *
 * The same DocumentEvent → DocumentAST mutation is implemented in two
 * languages: this TypeScript `applyDocumentEvents` (runtime authority for the
 * React UI) and Rust `ergo-core::apply_document_event` (used by the WASM
 * worker and the backend session mirror). The `ts-rs` types guarantee
 * *structural* agreement of the data, but nothing enforces *behavioral*
 * agreement of the two implementations.
 *
 * The cases below pin the high-risk mutations where the two stacks have
 * historically drifted. Each case has a matching assertion in the Rust
 * `ergo-core` document_session tests
 * (`document_session_tests.rs :: applies_document_event_variants_to_backend_ast`
 * and `update_figure_body_text_replaces_non_paragraph_content`). When behavior
 * changes, both sides must be updated in the same change — drift surfaces in
 * review.
 *
 * Per AGENTS.md this is a contract test, not a product-instance snapshot: it
 * asserts the relationship between two implementations of the same mutation,
 * not a concrete shipped document.
 */
import { describe, expect, it } from "vitest";
import { applyDocumentEvents } from "./documentEvents";
import { createTestDocumentAST } from "../test/documentAstFixture";
import type { DocumentAST } from "../bindings/DocumentAST";

describe("document event cross-stack parity", () => {
    it("updateInput /title mirrors inputs.title into metadata.title", () => {
        const ast = createTestDocumentAST();
        const next = applyDocumentEvents(ast, [
            { type: "updateInput", path: "/title", value: "Parity Title" },
        ]);
        expect(next.metadata.title).toBe("Parity Title");
        expect(next.inputs.title).toBe("Parity Title");
    });

    it("updateInput /keywords mirrors inputs.keywords into metadata.keywords", () => {
        const ast = createTestDocumentAST();
        const next = applyDocumentEvents(ast, [
            {
                type: "updateInput",
                path: "/keywords",
                value: ["ergonomics", "typst"],
            },
        ]);
        expect(next.metadata.keywords).toEqual(["ergonomics", "typst"]);
        expect(next.inputs.keywords).toEqual(["ergonomics", "typst"]);
    });

    it("updateInput /keywords coerces a non-array value to []", () => {
        const ast = createTestDocumentAST();
        const next = applyDocumentEvents(ast, [
            { type: "updateInput", path: "/keywords", value: "not-an-array" },
        ]);
        expect(next.metadata.keywords).toEqual([]);
    });

    it("updateFigure body_text on a non-paragraph body replaces it with a Paragraph (id = '{figureId}-body')", () => {
        // Seed an AST with a figure whose body is a List (non-paragraph).
        const base = createTestDocumentAST();
        const seed: DocumentAST = {
            ...base,
            sections: base.sections.map((section) =>
                section.type === "Content"
                    ? {
                          ...section,
                          elements: [
                              {
                                  type: "Figure",
                                  id: "figure-list",
                                  asset_id: null,
                                  content: {
                                      type: "List",
                                      id: "figure-list-body",
                                      items: [],
                                  },
                                  caption: "",
                                  placement: "",
                                  extra_fields: {},
                              },
                              ...section.elements,
                          ],
                      }
                    : section,
            ),
        };

        const next = applyDocumentEvents(seed, [
            {
                type: "updateFigure",
                element_id: "figure-list",
                caption: null,
                placement: null,
                body_text: "Caption text",
                asset_id: null,
            },
        ]);

        const figure = next.sections
            .flatMap((s) => (s.type === "Content" ? s.elements : []))
            .find(
                (e): e is Extract<typeof e, { type: "Figure" }> =>
                    e.type === "Figure" && e.id === "figure-list",
            );
        expect(figure?.content.type).toBe("Paragraph");
        expect(figure?.content.id).toBe("figure-list-body");
    });
});
