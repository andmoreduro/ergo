import { describe, it, expect } from "vitest";
import { astReducer } from "./reducer";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { ASTAction } from "./actions";
import { createRichText } from "./defaults";
import { createTestDocumentAST } from "../../test/documentAstFixture";

const getContentSection = (state: DocumentAST) => {
    const section = state.sections.find((item) => item.type === "Content");
    expect(section?.type).toBe("Content");
    return section?.type === "Content" ? section : undefined;
};

describe("astReducer", () => {
    it("returns the same state for unknown actions", () => {
        const state = createTestDocumentAST();
        const action = { type: "UNKNOWN_ACTION" } as unknown as ASTAction;
        const nextState = astReducer(state, action);

        expect(nextState).toBe(state);
    });

    it("loads a complete document snapshot", () => {
        const state = createTestDocumentAST();
        const nextDocument = {
            ...createTestDocumentAST(),
            metadata: {
                ...state.metadata,
                title: "Loaded",
            },
        };

        const nextState = astReducer(state, {
            type: "LOAD_DOCUMENT",
            payload: { ast: nextDocument },
        });

        expect(nextState.metadata.title).toBe("Loaded");
        const content = nextState.sections.find((section) => section.type === "Content");
        expect(content?.type).toBe("Content");
        expect(content?.elements.at(-1)?.type).toBe("Paragraph");
    });

    it("updates input values via UPDATE_INPUT without mutating the original state", () => {
        const state = createTestDocumentAST();

        let nextState = astReducer(state, {
            type: "UPDATE_PROJECT_TITLE",
            payload: { title: "Research Notes" },
        });

        nextState = astReducer(nextState, {
            type: "UPDATE_INPUT",
            payload: {
                path: "/notes",
                value: "A compact note.",
            },
        });

        expect(state.metadata.title).toBe("Untitled Document");
        expect(state.inputs.notes).toBe("");
        expect(nextState.metadata.title).toBe("Research Notes");
        expect(nextState.inputs.notes).toBe("A compact note.");
    });

    it("inserts and updates items in input arrays", () => {
        const state = createTestDocumentAST();

        const withAuthor = astReducer(state, {
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path: "/authors",
                index: 0,
                value: { name: "", affiliations: [] },
            },
        });

        const updated = astReducer(withAuthor, {
            type: "UPDATE_INPUT",
            payload: {
                path: "/authors/0/name",
                value: "Ada Lovelace",
            },
        });

        expect(state.inputs.authors).toHaveLength(1);
        expect(withAuthor.inputs.authors).toHaveLength(2);
        expect(updated.inputs.authors[0].name).toBe("Ada Lovelace");
    });

    it("inserts paragraphs and headings in document order", () => {
        const state = createTestDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();
        const sectionId = content?.id ?? "";

        const withParagraph = astReducer(state, {
            type: "ADD_PARAGRAPH",
            payload: { sectionId, paragraphId: "para-1" },
        });
        const withHeading = astReducer(withParagraph, {
            type: "ADD_HEADING",
            payload: {
                sectionId,
                headingId: "heading-1",
                level: 3,
                afterElementId: "para-1",
            },
        });
        const updated = astReducer(withHeading, {
            type: "UPDATE_PARAGRAPH_TEXT",
            payload: { paragraphId: "para-1", text: "Hello, World!" },
        });

        const section = getContentSection(updated);
        expect(section?.elements.map((element) => element.id)).toEqual([
            "para-1",
            "heading-1",
        ]);
        expect(section?.elements[1].type).toBe("Heading");
        const paragraph = section?.elements[0];
        expect(paragraph?.type).toBe("Paragraph");
        expect(paragraph?.type === "Paragraph" ? paragraph.content[0].text : "").toBe(
            "Hello, World!",
        );
    });

    it("updates table cells and dimensions", () => {
        const state = createTestDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();

        const withTable = astReducer(state, {
            type: "ADD_TABLE",
            payload: { sectionId: content?.id ?? "", tableId: "table-1" },
        });
        const withCell = astReducer(withTable, {
            type: "UPDATE_TABLE_CELL",
            payload: {
                tableId: "table-1",
                rowIndex: 0,
                colIndex: 1,
                elements: [
                    {
                        type: "Paragraph",
                        id: "cell-p-test",
                        content: [createRichText("Cell B")],
                    },
                ],
            },
        });
        const withColumn = astReducer(withCell, {
            type: "ADD_TABLE_COLUMN",
            payload: { tableId: "table-1" },
        });

        const table = getContentSection(withColumn)?.elements[0];
        expect(table?.type).toBe("Table");
        if (table?.type === "Table") {
            expect(table.cols).toBe(3);
            const cellParagraph = table.cells[0][1].elements[0];
            expect(cellParagraph?.type).toBe("Paragraph");
            if (cellParagraph?.type === "Paragraph") {
                expect(cellParagraph.content).toEqual([createRichText("Cell B")]);
            }
            expect(table.column_sizes).toHaveLength(3);
        }
    });

    it("updates equations and figures", () => {
        const state = createTestDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();

        const withEquation = astReducer(state, {
            type: "ADD_EQUATION",
            payload: { sectionId: content?.id ?? "", equationId: "eq-1" },
        });
        const withFigure = astReducer(withEquation, {
            type: "ADD_FIGURE",
            payload: { sectionId: content?.id ?? "", figureId: "fig-1" },
        });
        const updatedEquation = astReducer(withFigure, {
            type: "UPDATE_EQUATION",
            payload: {
                equationId: "eq-1",
                latexSource: "x^2",
                isBlock: false,
            },
        });
        const updatedFigure = astReducer(updatedEquation, {
            type: "UPDATE_FIGURE",
            payload: {
                figureId: "fig-1",
                caption: "A figure",
                bodyText: "Figure body",
            },
        });

        const elements = getContentSection(updatedFigure)?.elements ?? [];
        const equation = elements.find((element) => element.id === "eq-1");
        const figure = elements.find((element) => element.id === "fig-1");

        expect(equation?.type).toBe("Equation");
        expect(equation?.type === "Equation" ? equation.is_block : true).toBe(false);
        expect(figure?.type).toBe("Figure");
        expect(figure?.type === "Figure" ? figure.caption : "").toBe("A figure");
    });

    it("adds and updates quote, diagram, list, and enumeration elements", () => {
        const state = createTestDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();
        const sectionId = content?.id ?? "";

        const withEnumeration = [
            { type: "ADD_QUOTE", payload: { sectionId, quoteId: "quote-1" } },
            { type: "ADD_DIAGRAM", payload: { sectionId, diagramId: "diagram-1" } },
            { type: "ADD_LIST", payload: { sectionId, listId: "list-1" } },
            {
                type: "ADD_ENUMERATION",
                payload: { sectionId, enumerationId: "enum-1" },
            },
        ].reduce(
            (current, action) => astReducer(current, action as ASTAction),
            state,
        );

        const next = [
            {
                type: "UPDATE_QUOTE_CONTENT",
                payload: {
                    quoteId: "quote-1",
                    content: [createRichText("Quoted")],
                },
            },
            {
                type: "UPDATE_DIAGRAM",
                payload: {
                    diagramId: "diagram-1",
                    mermaidSource: "flowchart TD\nA-->B",
                    assetId: "diagram-1",
                    caption: "Diagram",
                },
            },
            {
                type: "UPDATE_LIST_ITEM",
                payload: {
                    listId: "list-1",
                    itemPath: [1],
                    content: [createRichText("Second")],
                },
            },
            {
                type: "UPDATE_ENUMERATION_ITEM",
                payload: {
                    enumerationId: "enum-1",
                    itemPath: [1],
                    content: [createRichText("Second enum")],
                },
            },
        ].reduce(
            (current, action) => astReducer(current, action as ASTAction),
            withEnumeration,
        );

        const elements = getContentSection(next)?.elements ?? [];
        expect(elements.map((element) => element.type)).toEqual([
            "Quote",
            "Diagram",
            "List",
            "Enumeration",
        ]);
        const quote = elements[0];
        const diagram = elements[1];
        const list = elements[2];
        const enumeration = elements[3];
        expect(quote?.type === "Quote" ? quote.content[0].text : "").toBe("Quoted");
        expect(diagram?.type === "Diagram" ? diagram.asset_id : null).toBe("diagram-1");
        expect(list?.type === "List" ? list.items[1].content[0].text : "").toBe("Second");
        expect(enumeration?.type === "Enumeration" ? enumeration.items[1].content[0].text : "").toBe(
            "Second enum",
        );
    });

    it("removes an element", () => {
        const state = createTestDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();

        const withParagraph = astReducer(state, {
            type: "ADD_PARAGRAPH",
            payload: { sectionId: content?.id ?? "", paragraphId: "para-1" },
        });
        const nextState = astReducer(withParagraph, {
            type: "REMOVE_ELEMENT",
            payload: { elementId: "para-1" },
        });

        expect(getContentSection(nextState)?.elements).toHaveLength(0);
    });

    it("removes generated diagram asset when diagram is deleted", () => {
        let state = createTestDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();

        state = astReducer(state, {
            type: "ADD_DIAGRAM",
            payload: {
                sectionId: content?.id ?? "",
                diagramId: "diagram-1",
            },
        });
        state = astReducer(state, {
            type: "UPDATE_DIAGRAM",
            payload: {
                diagramId: "diagram-1",
                mermaidSource: "flowchart TD\nA-->B",
                assetId: "diagram-1",
            },
        });
        state = astReducer(state, {
            type: "ADD_ASSET",
            payload: {
                asset: {
                    id: "diagram-1",
                    path: "assets/diagrams/diagram-1.svg",
                    kind: "image",
                    caption: null,
                },
            },
        });

        const nextState = astReducer(state, {
            type: "REMOVE_ELEMENT",
            payload: { elementId: "diagram-1" },
        });

        expect(getContentSection(nextState)?.elements).toHaveLength(0);
        expect(nextState.assets).toHaveLength(0);
    });

    it("updates element extra fields", () => {
        const state = createTestDocumentAST();
        const content = getContentSection(state);

        const withFigure = astReducer(state, {
            type: "ADD_FIGURE",
            payload: { sectionId: content?.id ?? "", figureId: "fig-1" },
        });

        const updated = astReducer(withFigure, {
            type: "UPDATE_ELEMENT_EXTRA_FIELD",
            payload: {
                elementId: "fig-1",
                fieldKey: "note",
                fieldValue: "General Note Content",
            },
        });

        const elements = getContentSection(updated)?.elements ?? [];
        const figure = elements.find((element) => element.id === "fig-1");
        expect(figure?.type).toBe("Figure");
        if (figure?.type === "Figure") {
            expect(figure.extra_fields["note"]).toBe("General Note Content");
        }
    });

    it("adds, updates, and removes references and assets without mutating the original state", () => {
        const state = createTestDocumentAST();

        const withReference = astReducer(state, {
            type: "ADD_REFERENCE",
            payload: {
                reference: {
                    id: "ref-1",
                    citation_key: "garcia2024",
                    biblatex: "@article{garcia2024,\n  title = {Niñez}\n}",
                },
            },
        });
        const updatedReference = astReducer(withReference, {
            type: "UPDATE_REFERENCE",
            payload: {
                reference: {
                    id: "ref-1",
                    citation_key: "garcia2025",
                    biblatex: "@book{garcia2025,\n  title = {Libro}\n}",
                },
            },
        });
        const removedReference = astReducer(updatedReference, {
            type: "REMOVE_REFERENCE",
            payload: { referenceId: "ref-1" },
        });

        expect(state.references).toHaveLength(0);
        expect(withReference.references[0].citation_key).toBe("garcia2024");
        expect(updatedReference.references[0].citation_key).toBe("garcia2025");
        expect(removedReference.references).toHaveLength(0);

        const withAsset = astReducer(state, {
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
        const updatedAsset = astReducer(withAsset, {
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
        const removedAsset = astReducer(updatedAsset, {
            type: "REMOVE_ASSET",
            payload: { assetId: "asset-1" },
        });

        expect(state.assets).toHaveLength(0);
        expect(withAsset.assets[0].caption).toBe("Chart");
        expect(updatedAsset.assets[0].caption).toBe("Updated chart");
        expect(removedAsset.assets).toHaveLength(0);
    });
});
