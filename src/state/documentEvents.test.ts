import { describe, expect, it } from "vitest";
import {
    applyDocumentEventToAst,
    applyDocumentEvents,
    createDocumentEventHistoryEntry,
} from "./documentEvents";
import { createDefaultDocumentAST } from "./ast/defaults";
import { astReducer } from "./ast/reducer";
import type { ASTAction } from "./ast/actions";
import type { DocumentAST } from "../bindings/DocumentAST";

describe("document event conversion", () => {
    it("maps project title actions to forward sync events", () => {
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
    });

    it("maps project title actions to inverse sync events", () => {
        const previousAst = createDefaultDocumentAST();
        const action: ASTAction = {
            type: "UPDATE_PROJECT_TITLE",
            payload: { title: "Borrador con ñ" },
        };
        const nextAst = astReducer(previousAst, action);

        const entry = createDocumentEventHistoryEntry(previousAst, action, nextAst);

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

    it("maps remove element actions to remove sync events", () => {
        let previousAst = createDefaultDocumentAST();
        const contentSection = previousAst.sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            throw new Error("content section missing");
        }
        previousAst = astReducer(previousAst, {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId: contentSection.id,
                paragraphId: "paragraph-1",
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
    });

    it("stores removed element data and position in inverse events", () => {
        let previousAst = createDefaultDocumentAST();
        const contentSection = previousAst.sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            throw new Error("content section missing");
        }
        previousAst = astReducer(previousAst, {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId: contentSection.id,
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

        expect(entry.inverseEvents[0]).toEqual({
            type: "restoreElement",
            section_id: contentSection.id,
            index: 0,
            element: {
                type: "Paragraph",
                id: "paragraph-1",
                content: [
                    {
                        text: "Texto eliminado",
                        bold: null,
                        italic: null,
                        kind: null,
                        reference_id: null,
                        equation_source: null,
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

    it("handles UPDATE_PROJECT_TITLE round-trip", () => {
        const ast = createDefaultDocumentAST();
        verifyRoundTrip(ast, {
            type: "UPDATE_PROJECT_TITLE",
            payload: { title: "Nuevo Título con ñ" },
        });
    });

    it("handles UPDATE_PARAGRAPH_TEXT round-trip", () => {
        const base = createDefaultDocumentAST();
        const contentSection = base.sections.find((s) => s.type === "Content")!;
        const ast = astReducer(base, {
            type: "ADD_PARAGRAPH",
            payload: { sectionId: contentSection.id, paragraphId: "paragraph-1" },
        });
        verifyRoundTrip(ast, {
            type: "UPDATE_PARAGRAPH_TEXT",
            payload: { paragraphId: "paragraph-1", text: "Hola Mundo con ñ" },
        });
    });

    it("handles UPDATE_HEADING round-trip", () => {
        const base = createDefaultDocumentAST();
        const contentSection = base.sections.find((s) => s.type === "Content")!;
        const ast = astReducer(base, {
            type: "ADD_HEADING",
            payload: { sectionId: contentSection.id, headingId: "heading-1" },
        });
        verifyRoundTrip(ast, {
            type: "UPDATE_HEADING",
            payload: { headingId: "heading-1", text: "Nueva sección", level: 2 },
        });
    });

    it("handles ADD_PARAGRAPH round-trip", () => {
        const ast = createDefaultDocumentAST();
        const contentSection = ast.sections.find((s) => s.type === "Content")!;
        verifyRoundTrip(ast, {
            type: "ADD_PARAGRAPH",
            payload: { sectionId: contentSection.id, paragraphId: "paragraph-1" },
        });
    });

    it("handles REMOVE_ELEMENT round-trip", () => {
        const base = createDefaultDocumentAST();
        const contentSection = base.sections.find((s) => s.type === "Content")!;
        const ast = astReducer(base, {
            type: "ADD_PARAGRAPH",
            payload: { sectionId: contentSection.id, paragraphId: "paragraph-1" },
        });
        verifyRoundTrip(ast, {
            type: "REMOVE_ELEMENT",
            payload: { elementId: "paragraph-1" },
        });
    });

    it("handles UPDATE_TABLE_CELL round-trip", () => {
        const base = createDefaultDocumentAST();
        const contentSection = base.sections.find((s) => s.type === "Content")!;
        const ast = astReducer(base, {
            type: "ADD_TABLE",
            payload: { sectionId: contentSection.id, tableId: "table-1" },
        });
        verifyRoundTrip(ast, {
            type: "UPDATE_TABLE_CELL",
            payload: { tableId: "table-1", rowIndex: 0, colIndex: 0, text: "Nueva celda" },
        });
    });

    it("handles ADD_TABLE_ROW round-trip", () => {
        const base = createDefaultDocumentAST();
        const contentSection = base.sections.find((s) => s.type === "Content")!;
        const ast = astReducer(base, {
            type: "ADD_TABLE",
            payload: { sectionId: contentSection.id, tableId: "table-1" },
        });
        verifyRoundTrip(ast, {
            type: "ADD_TABLE_ROW",
            payload: { tableId: "table-1" },
        });
    });

    it("handles UPDATE_INPUT round-trip", () => {
        const ast = createDefaultDocumentAST();
        verifyRoundTrip(ast, {
            type: "UPDATE_INPUT",
            payload: { path: "/abstract_text", value: "New abstract text" },
        });
    });

    it("handles UPDATE_INPUT title metadata round-trip", () => {
        const ast = createDefaultDocumentAST();
        verifyRoundTrip(ast, {
            type: "UPDATE_INPUT",
            payload: { path: "/title", value: "Title from input" },
        });
    });

    it("handles INSERT_INPUT_ARRAY_ITEM round-trip", () => {
        const ast = createDefaultDocumentAST();
        verifyRoundTrip(ast, {
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path: "/authors",
                index: 0,
                value: { name: "New Author", email: "new@example.com", affiliations: [] },
            },
        });
    });

    it("handles UPDATE_ELEMENT_EXTRA_FIELD round-trip", () => {
        const base = createDefaultDocumentAST();
        const contentSection = base.sections.find((s) => s.type === "Content")!;
        const ast = astReducer(base, {
            type: "ADD_FIGURE",
            payload: { sectionId: contentSection.id, figureId: "fig-1" },
        });
        verifyRoundTrip(ast, {
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: "fig-1",
                fieldKey: "note",
                fieldValue: "General Note Content",
            },
        });
    });

    it("handles reference add, update, and remove round-trips", () => {
        const ast = createDefaultDocumentAST();
        verifyRoundTrip(ast, {
            type: "ADD_REFERENCE",
            payload: {
                reference: {
                    id: "ref-1",
                    citation_key: "garcia2024",
                    biblatex: "@article{garcia2024,\n  title = {Niñez}\n}",
                },
            },
        });

        const withReference = astReducer(ast, {
            type: "ADD_REFERENCE",
            payload: {
                reference: {
                    id: "ref-1",
                    citation_key: "garcia2024",
                    biblatex: "@article{garcia2024,\n  title = {Niñez}\n}",
                },
            },
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

    it("handles asset add, update, and remove round-trips", () => {
        const ast = createDefaultDocumentAST();
        verifyRoundTrip(ast, {
            type: "ADD_ASSET",
            payload: {
                asset: {
                    id: "asset-1",
                    path: "assets/chart.png",
                    kind: "image",
                    caption: "Chart",
                },
            },
        });

        const withAsset = astReducer(ast, {
            type: "ADD_ASSET",
            payload: {
                asset: {
                    id: "asset-1",
                    path: "assets/chart.png",
                    kind: "image",
                    caption: "Chart",
                },
            },
        });

        verifyRoundTrip(withAsset, {
            type: "UPDATE_ASSET",
            payload: {
                asset: {
                    id: "asset-1",
                    path: "assets/chart.png",
                    kind: "image",
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
