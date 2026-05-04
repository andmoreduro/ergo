import { describe, it, expect } from "vitest";
import { astReducer } from "./reducer";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { ASTAction } from "./actions";
import { createDefaultDocumentAST } from "./defaults";

const getContentSection = (state: DocumentAST) => {
    const section = state.sections.find((item) => item.type === "Content");
    expect(section?.type).toBe("Content");
    return section?.type === "Content" ? section : undefined;
};

const getCoverPage = (state: DocumentAST) => {
    const section = state.sections.find((item) => item.type === "CoverPage");
    expect(section?.type).toBe("CoverPage");
    return section?.type === "CoverPage" ? section : undefined;
};

describe("astReducer", () => {
    it("returns the same state for unknown actions", () => {
        const state = createDefaultDocumentAST();
        const action = { type: "UNKNOWN_ACTION" } as unknown as ASTAction;
        const nextState = astReducer(state, action);

        expect(nextState).toBe(state);
    });

    it("loads a complete document snapshot", () => {
        const state = createDefaultDocumentAST();
        const nextDocument = {
            ...createDefaultDocumentAST(),
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
        expect(nextState).toBe(nextDocument);
    });

    it("updates cover page metadata without mutating the original state", () => {
        const state = createDefaultDocumentAST();
        const coverPage = getCoverPage(state);
        expect(coverPage).toBeDefined();

        let nextState = astReducer(state, {
            type: "UPDATE_PROJECT_TITLE",
            payload: { title: "Research Notes" },
        });

        nextState = astReducer(nextState, {
            type: "UPDATE_COVER_PAGE_ABSTRACT",
            payload: {
                sectionId: coverPage?.id ?? "",
                abstractText: "A compact abstract.",
            },
        });

        expect(state.metadata.title).toBe("Untitled Document");
        expect(nextState.metadata.title).toBe("Research Notes");
        expect(getCoverPage(nextState)?.abstract_text).toBe("A compact abstract.");
    });

    it("adds and updates authors", () => {
        const state = createDefaultDocumentAST();
        const coverPage = getCoverPage(state);
        expect(coverPage).toBeDefined();

        const withAuthor = astReducer(state, {
            type: "ADD_AUTHOR",
            payload: { sectionId: coverPage?.id ?? "" },
        });

        const updated = astReducer(withAuthor, {
            type: "UPDATE_AUTHOR",
            payload: {
                sectionId: coverPage?.id ?? "",
                authorIndex: 0,
                field: "name",
                value: "Ada Lovelace",
            },
        });

        expect(getCoverPage(updated)?.authors[0].name).toBe("Ada Lovelace");
    });

    it("adds and updates paragraphs", () => {
        const state = createDefaultDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();

        const withParagraph = astReducer(state, {
            type: "ADD_PARAGRAPH",
            payload: { sectionId: content?.id ?? "", paragraphId: "para-1" },
        });
        const updated = astReducer(withParagraph, {
            type: "UPDATE_PARAGRAPH_TEXT",
            payload: { paragraphId: "para-1", text: "Hello, World!" },
        });

        const section = getContentSection(updated);
        const paragraph = section?.elements[0];
        expect(paragraph?.type).toBe("Paragraph");
        expect(paragraph?.type === "Paragraph" ? paragraph.content[0].text : "").toBe(
            "Hello, World!",
        );
    });

    it("inserts headings after a specific element", () => {
        const state = createDefaultDocumentAST();
        const content = getContentSection(state);
        expect(content).toBeDefined();

        const withParagraph = astReducer(state, {
            type: "ADD_PARAGRAPH",
            payload: { sectionId: content?.id ?? "", paragraphId: "para-1" },
        });
        const withHeading = astReducer(withParagraph, {
            type: "ADD_HEADING",
            payload: {
                sectionId: content?.id ?? "",
                headingId: "heading-1",
                level: 3,
                afterElementId: "para-1",
            },
        });

        const section = getContentSection(withHeading);
        expect(section?.elements.map((element) => element.id)).toEqual([
            "para-1",
            "heading-1",
        ]);
        expect(section?.elements[1].type).toBe("Heading");
    });

    it("updates table cells and dimensions", () => {
        const state = createDefaultDocumentAST();
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
                text: "Cell B",
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
            expect(table.cells[0][1].content).toBe("Cell B");
            expect(table.column_sizes).toHaveLength(3);
        }
    });

    it("updates equations and figures", () => {
        const state = createDefaultDocumentAST();
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

    it("removes an element", () => {
        const state = createDefaultDocumentAST();
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
});
