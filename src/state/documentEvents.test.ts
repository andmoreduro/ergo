import { describe, expect, it } from "vitest";
import {
    applyDocumentEvents,
    createDocumentEventHistoryEntry,
} from "./documentEvents";
import { createDefaultDocumentAST, createRichText } from "./ast/defaults";
import { astReducer } from "./ast/reducer";
import type { ASTAction } from "./ast/actions";
import type { DocumentAST } from "../bindings/DocumentAST";

const contentSectionId = (ast: DocumentAST): string => {
    const section = ast.sections.find((entry) => entry.type === "Content");
    if (!section || section.type !== "Content") {
        throw new Error("content section missing");
    }
    return section.id;
};

describe("document event conversion", () => {
    it("maps UPDATE_PROJECT_TITLE to forward and inverse sync events", () => {
        const previousAst = createDefaultDocumentAST();
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
        const previousAst = createDefaultDocumentAST();
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
        let previousAst = createDefaultDocumentAST();
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
            name: "UPDATE_PROJECT_TITLE",
            setup: () => ({
                ast: createDefaultDocumentAST(),
                action: {
                    type: "UPDATE_PROJECT_TITLE",
                    payload: { title: "Nuevo Título con ñ" },
                },
            }),
        },
        {
            name: "UPDATE_INPUT",
            setup: () => ({
                ast: createDefaultDocumentAST(),
                action: {
                    type: "UPDATE_INPUT",
                    payload: { path: "/abstract_text", value: "New abstract text" },
                },
            }),
        },
        {
            name: "UPDATE_INPUT title metadata",
            setup: () => ({
                ast: createDefaultDocumentAST(),
                action: {
                    type: "UPDATE_INPUT",
                    payload: { path: "/title", value: "Title from input" },
                },
            }),
        },
        {
            name: "INSERT_INPUT_ARRAY_ITEM",
            setup: () => ({
                ast: createDefaultDocumentAST(),
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
            name: "UPDATE_PARAGRAPH_TEXT",
            setup: () => {
                const base = createDefaultDocumentAST();
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
                const base = createDefaultDocumentAST();
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
                const ast = createDefaultDocumentAST();
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
                const base = createDefaultDocumentAST();
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
                const base = createDefaultDocumentAST();
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
                            content: [createRichText("Nueva celda")],
                        },
                    },
                };
            },
        },
        {
            name: "ADD_TABLE_ROW",
            setup: () => {
                const base = createDefaultDocumentAST();
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
                const base = createDefaultDocumentAST();
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
    ];

    it.each(projectRoundTrips)("$name round-trips", ({ setup }) => {
        const { ast, action } = setup();
        verifyRoundTrip(ast, action);
    });

    it.each(contentRoundTrips)("$name round-trips", ({ setup }) => {
        const { ast, action } = setup();
        verifyRoundTrip(ast, action);
    });

    it("round-trips reference add, update, and remove", () => {
        const ast = createDefaultDocumentAST();
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
        const ast = createDefaultDocumentAST();
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
});
