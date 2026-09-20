import { describe, expect, it } from "vitest";
import {
    applyDocumentEvents,
    createDocumentEventHistoryEntry,
} from "./documentEvents";
import { createRichText, createTable } from "./ast/defaults";
import { createTestDocumentAST } from "../test/documentAstFixture";
import { astReducer } from "./ast/reducer";
import type { ASTAction } from "./ast/actions";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { DocumentEvent } from "../bindings/DocumentEvent";

const contentSectionId = (ast: DocumentAST): string => {
    const section = ast.sections.find((entry) => entry.type === "Content");
    if (!section || section.type !== "Content") {
        throw new Error("content section missing");
    }
    return section.id;
};

describe("document event conversion", () => {
    // The same DocumentEvent → DocumentAST mutation is implemented twice: this
    // TypeScript applyDocumentEvents (React runtime authority) and Rust
    // ergo-core::apply_document_event (WASM worker + backend session mirror).
    // ts-rs guarantees structural agreement of the types; the high-risk
    // mutations (input metadata mirroring, figure body replacement) have
    // matching assertions in ergo-core `document_session_tests.rs`. When
    // behavior changes, both sides must be updated in the same change.

    it("maps UPDATE_PROJECT_TITLE to forward and inverse sync events", () => {
        const previousAst = createTestDocumentAST();
        const action: ASTAction = {
            type: "UPDATE_PROJECT_TITLE",
            payload: { title: "Borrador con ñ" },
        };
        const nextAst = astReducer(previousAst, action);

        const entry = createDocumentEventHistoryEntry(previousAst, action, nextAst);

        expect(entry.forwardEvents[0]).toEqual({
            type: "setProjectTitle",
            title: "Borrador con ñ",
        });
        expect(entry.inverseEvents[0]).toEqual({
            type: "setProjectTitle",
            title: "Untitled Document",
        });
    });

    it("keeps history entries free of AST snapshots", () => {
        const previousAst = createTestDocumentAST();
        const action: ASTAction = {
            type: "UPDATE_PROJECT_TITLE",
            payload: { title: "Borrador con ñ" },
        };
        const nextAst = astReducer(previousAst, action);

        const entry = createDocumentEventHistoryEntry(previousAst, action, nextAst);

        expect(entry).not.toHaveProperty("previousAst");
        expect(entry).not.toHaveProperty("nextAst");
    });

    it("maps REMOVE_ELEMENT to forward and restore inverse events", () => {
        let previousAst = createTestDocumentAST();
        const sectionId = contentSectionId(previousAst);
        previousAst = astReducer(previousAst, {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId,
                paragraphId: "paragraph-1",
            },
        });
        previousAst = astReducer(previousAst, {
            type: "UPDATE_PARAGRAPH_TEXT",
            payload: {
                paragraphId: "paragraph-1",
                text: "Texto eliminado",
            },
        });
        const action: ASTAction = {
            type: "REMOVE_ELEMENT",
            payload: { elementId: "paragraph-1" },
        };
        const nextAst = astReducer(previousAst, action);

        const entry = createDocumentEventHistoryEntry(previousAst, action, nextAst);

        expect(entry.forwardEvents[0]).toEqual({
            type: "removeElement",
            element_id: "paragraph-1",
        });
        expect(entry.inverseEvents[0]).toEqual({
            type: "restoreElement",
            section_id: sectionId,
            index: 0,
            element: {
                type: "Paragraph",
                id: "paragraph-1",
                content: [
                    {
                        text: "Texto eliminado",
                        bold: null,
                        italic: null,
                        underline: null,
                        kind: null,
                        reference_id: null,
                        equation_source: null,
                        equation_syntax: "typst",
                        quote_attribution_text: null,
                        quote_attribution_reference_id: null,
                    },
                ],
            },
        });
    });
});

describe("applyDocumentEventToAst round-trip parity", () => {
    function verifyRoundTrip(initialAst: DocumentAST, action: ASTAction) {
        const nextAst = astReducer(initialAst, action);
        const { forwardEvents, inverseEvents } = createDocumentEventHistoryEntry(
            initialAst,
            action,
            nextAst,
        );

        const intermediateAst = applyDocumentEvents(initialAst, forwardEvents);
        expect(intermediateAst).toEqual(nextAst);

        const restoredAst = applyDocumentEvents(intermediateAst, inverseEvents);
        expect(restoredAst).toEqual(initialAst);
    }

    type RoundTripCase = {
        name: string;
        setup: () => { ast: DocumentAST; action: ASTAction };
    };

    const projectRoundTrips: RoundTripCase[] = [
        {
            // The inverse must restore "no variant", not a hardcoded default.
            name: "UPDATE_TEMPLATE_VARIANT from unset",
            setup: () => {
                const base = createTestDocumentAST();
                return {
                    ast: {
                        ...base,
                        metadata: { ...base.metadata, template_variant_id: null },
                    },
                    action: {
                        type: "UPDATE_TEMPLATE_VARIANT",
                        payload: { variantId: "professional" },
                    },
                };
            },
        },
        {
            name: "UPDATE_PROJECT_TITLE",
            setup: () => ({
                ast: createTestDocumentAST(),
                action: {
                    type: "UPDATE_PROJECT_TITLE",
                    payload: { title: "Nuevo Título con ñ" },
                },
            }),
        },
        {
            name: "UPDATE_INPUT",
            setup: () => ({
                ast: createTestDocumentAST(),
                action: {
                    type: "UPDATE_INPUT",
                    payload: { path: "/notes", value: "New note text" },
                },
            }),
        },
        {
            name: "UPDATE_INPUT title metadata",
            setup: () => ({
                ast: createTestDocumentAST(),
                action: {
                    type: "UPDATE_INPUT",
                    payload: { path: "/title", value: "Title from input" },
                },
            }),
        },
        {
            name: "UPDATE_INPUT keywords metadata coerces to string array",
            setup: () => {
                const base = createTestDocumentAST();
                // Seed inputs.keywords so forward+inverse is a true round-trip
                // (the default fixture omits the key).
                const ast = applyDocumentEvents(base, [
                    { type: "updateInput", path: "/keywords", value: [] },
                ]);
                return {
                    ast,
                    action: {
                        type: "UPDATE_INPUT",
                        payload: {
                            path: "/keywords",
                            value: ["ergonomics", "typst"],
                        },
                    },
                };
            },
        },
        {
            name: "INSERT_INPUT_ARRAY_ITEM",
            setup: () => ({
                ast: createTestDocumentAST(),
                action: {
                    type: "INSERT_INPUT_ARRAY_ITEM",
                    payload: {
                        path: "/authors",
                        index: 0,
                        value: {
                            name: "New Author",
                            email: "new@example.com",
                            affiliations: [],
                        },
                    },
                },
            }),
        },
    ];

    const contentRoundTrips: RoundTripCase[] = [
        {
            // Undoing an attach must detach: a null asset_id alone means
            // "unchanged" for both the TS and Rust appliers (clear_asset).
            name: "UPDATE_FIGURE attaches an asset",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_FIGURE",
                    payload: { sectionId, figureId: "figure-1" },
                });
                return {
                    ast,
                    action: {
                        type: "UPDATE_FIGURE",
                        payload: { figureId: "figure-1", assetId: "asset-1" },
                    },
                };
            },
        },
        {
            name: "UPDATE_DIAGRAM attaches an asset",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_DIAGRAM",
                    payload: { sectionId, diagramId: "diagram-1" },
                });
                return {
                    ast,
                    action: {
                        type: "UPDATE_DIAGRAM",
                        payload: { diagramId: "diagram-1", assetId: "asset-1" },
                    },
                };
            },
        },
        {
            name: "UPDATE_PARAGRAPH_TEXT",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_PARAGRAPH",
                    payload: { sectionId, paragraphId: "paragraph-1" },
                });
                return {
                    ast,
                    action: {
                        type: "UPDATE_PARAGRAPH_TEXT",
                        payload: {
                            paragraphId: "paragraph-1",
                            text: "Hola Mundo con ñ",
                        },
                    },
                };
            },
        },
        {
            name: "UPDATE_HEADING",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_HEADING",
                    payload: { sectionId, headingId: "heading-1" },
                });
                return {
                    ast,
                    action: {
                        type: "UPDATE_HEADING",
                        payload: {
                            headingId: "heading-1",
                            text: "Nueva sección",
                            level: 2,
                        },
                    },
                };
            },
        },
        {
            name: "ADD_PARAGRAPH",
            setup: () => {
                const ast = createTestDocumentAST();
                return {
                    ast,
                    action: {
                        type: "ADD_PARAGRAPH",
                        payload: {
                            sectionId: contentSectionId(ast),
                            paragraphId: "paragraph-1",
                        },
                    },
                };
            },
        },
        {
            name: "REMOVE_ELEMENT",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_PARAGRAPH",
                    payload: { sectionId, paragraphId: "paragraph-1" },
                });
                return {
                    ast,
                    action: {
                        type: "REMOVE_ELEMENT",
                        payload: { elementId: "paragraph-1" },
                    },
                };
            },
        },
        {
            name: "UPDATE_TABLE_CELL",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_TABLE",
                    payload: { sectionId, tableId: "table-1" },
                });
                return {
                    ast,
                    action: {
                        type: "UPDATE_TABLE_CELL",
                        payload: {
                            tableId: "table-1",
                            rowIndex: 0,
                            colIndex: 0,
                            elements: [
                                {
                                    type: "Paragraph",
                                    id: "cell-p-event",
                                    content: [createRichText("Nueva celda")],
                                },
                            ],
                        },
                    },
                };
            },
        },
        {
            name: "ADD_TABLE_ROW",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_TABLE",
                    payload: { sectionId, tableId: "table-1" },
                });
                return {
                    ast,
                    action: {
                        type: "ADD_TABLE_ROW",
                        payload: { tableId: "table-1" },
                    },
                };
            },
        },
        {
            name: "UPDATE_ELEMENT_EXTRA_FIELD",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_FIGURE",
                    payload: { sectionId, figureId: "fig-1" },
                });
                return {
                    ast,
                    action: {
                        type: "UPDATE_ELEMENT_EXTRA_FIELD",
                        payload: {
                            elementId: "fig-1",
                            fieldKey: "note",
                            fieldValue: "General Note Content",
                        },
                    },
                };
            },
        },
        {
            name: "UPDATE_DIAGRAM",
            setup: () => {
                const base = createTestDocumentAST();
                const sectionId = contentSectionId(base);
                const ast = astReducer(base, {
                    type: "ADD_DIAGRAM",
                    payload: { sectionId, diagramId: "diagram-1" },
                });
                return {
                    ast,
                    action: {
                        type: "UPDATE_DIAGRAM",
                        payload: {
                            diagramId: "diagram-1",
                            caption: "Flow chart",
                        },
                    },
                };
            },
        },
    ];

    it.each(projectRoundTrips)("$name round-trips", ({ setup }) => {
        const { ast, action } = setup();
        verifyRoundTrip(ast, action);
    });

    it.each(contentRoundTrips)("$name round-trips", ({ setup }) => {
        const { ast, action } = setup();
        verifyRoundTrip(ast, action);
    });

    // Rust `remove_table_row` / `remove_table_column` refuse to empty a table;
    // the TypeScript applier must leave the AST unchanged rather than drift to
    // zero rows/columns the worker never accepted.
    it.each<DocumentEvent>([
        { type: "removeTableRow", table_id: "table-1", row_index: 0 },
        { type: "removeTableColumn", table_id: "table-1", col_index: 0 },
    ])("$type leaves a single-row, single-column table unchanged", (event) => {
        const ast = createTestDocumentAST();
        const section = ast.sections.find((entry) => entry.type === "Content");
        if (!section || section.type !== "Content") {
            throw new Error("content section missing");
        }
        section.elements.push(createTable(1, 1, "table-1"));

        expect(applyDocumentEvents(ast, [event])).toEqual(ast);
    });

    it("round-trips reference add, update, and remove", () => {
        const ast = createTestDocumentAST();
        const reference = {
            id: "ref-1",
            citation_key: "garcia2024",
            biblatex: "@article{garcia2024,\n  title = {Niñez}\n}",
        };

        verifyRoundTrip(ast, {
            type: "ADD_REFERENCE",
            payload: { reference },
        });

        const withReference = astReducer(ast, {
            type: "ADD_REFERENCE",
            payload: { reference },
        });

        verifyRoundTrip(withReference, {
            type: "UPDATE_REFERENCE",
            payload: {
                reference: {
                    id: "ref-1",
                    citation_key: "garcia2025",
                    biblatex: "@book{garcia2025,\n  title = {Libro}\n}",
                },
            },
        });
        verifyRoundTrip(withReference, {
            type: "REMOVE_REFERENCE",
            payload: { referenceId: "ref-1" },
        });
    });

    it("round-trips asset add, update, and remove", () => {
        const ast = createTestDocumentAST();
        const asset = {
            id: "asset-1",
            path: "assets/chart.png",
            kind: "image" as const,
            caption: "Chart",
        };

        verifyRoundTrip(ast, {
            type: "ADD_ASSET",
            payload: { asset },
        });

        const withAsset = astReducer(ast, {
            type: "ADD_ASSET",
            payload: { asset },
        });

        verifyRoundTrip(withAsset, {
            type: "UPDATE_ASSET",
            payload: {
                asset: {
                    ...asset,
                    caption: "Updated chart",
                },
            },
        });
        verifyRoundTrip(withAsset, {
            type: "REMOVE_ASSET",
            payload: { assetId: "asset-1" },
        });
    });

    it("updateInput /keywords mirrors inputs.keywords into metadata.keywords", () => {
        const ast = createTestDocumentAST();
        const { forwardEvents } = createDocumentEventHistoryEntry(
            ast,
            {
                type: "UPDATE_INPUT",
                payload: { path: "/keywords", value: ["ergonomics", "typst"] },
            },
            astReducer(ast, {
                type: "UPDATE_INPUT",
                payload: { path: "/keywords", value: ["ergonomics", "typst"] },
            }),
        );
        const next = applyDocumentEvents(ast, forwardEvents);

        expect(next.metadata.keywords).toEqual(["ergonomics", "typst"]);
    });

    it("updateInput /keywords coerces a non-array value to an empty array", () => {
        const ast = createTestDocumentAST();
        const { forwardEvents } = createDocumentEventHistoryEntry(
            ast,
            {
                type: "UPDATE_INPUT",
                payload: { path: "/keywords", value: "not-an-array" },
            },
            astReducer(ast, {
                type: "UPDATE_INPUT",
                payload: { path: "/keywords", value: "not-an-array" },
            }),
        );
        const next = applyDocumentEvents(ast, forwardEvents);

        expect(next.metadata.keywords).toEqual([]);
    });

    it("updateFigure body_text on a non-paragraph figure body replaces it with a paragraph (reducer == event log)", () => {
        // A body-text edit cannot be undone via a body-text event when the
        // body type changes, so this asserts forward parity (the property the
        // reducer/event-log duplication risks breaking) rather than a full
        // inverse round-trip.
        const base = createTestDocumentAST();
        const sectionId = contentSectionId(base);
        const withFigure = astReducer(base, {
            type: "ADD_FIGURE",
            payload: { sectionId, figureId: "fig-2" },
        });
        // Force a non-paragraph figure body so the replacement branch runs.
        const ast: DocumentAST = {
            ...withFigure,
            sections: withFigure.sections.map((section) =>
                section.type === "Content"
                    ? {
                          ...section,
                          elements: section.elements.map((element) =>
                              element.type === "Figure" && element.id === "fig-2"
                                  ? {
                                        ...element,
                                        content: {
                                            type: "List",
                                            id: "fig-2-list",
                                            items: [],
                                        },
                                    }
                                  : element,
                          ),
                      }
                    : section,
            ),
        };
        const action: ASTAction = {
            type: "UPDATE_FIGURE",
            payload: {
                figureId: "fig-2",
                caption: null,
                placement: null,
                bodyText: "Caption text",
                assetId: null,
            },
        };
        const expected = astReducer(ast, action);
        const { forwardEvents } = createDocumentEventHistoryEntry(
            ast,
            action,
            expected,
        );
        const next = applyDocumentEvents(ast, forwardEvents);

        // Both paths must produce the same figure body: a paragraph with the
        // stable "{figureId}-body" id, matching Rust update_figure_body.
        expect(next).toEqual(expected);
        const figure = next.sections
            .flatMap((s) => (s.type === "Content" ? s.elements : []))
            .find((e): e is Extract<DocumentElement, { type: "Figure" }> =>
                e.type === "Figure" ? e.id === "fig-2" : false,
            );
        expect(figure?.content.type).toBe("Paragraph");
        expect(figure?.content.id).toBe("fig-2-body");
    });
});
