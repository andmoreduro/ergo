import type { DocumentAST } from "../../bindings/DocumentAST";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { DocumentSection } from "../../bindings/DocumentSection";
import type { ASTAction } from "./actions";
import {
    createEquation,
    createFigure,
    createHeading,
    createParagraph,
    createRichText,
    createTable,
} from "./defaults";

type ParagraphElement = Extract<DocumentElement, { type: "Paragraph" }>;

const insertElement = (
    elements: DocumentElement[],
    newElement: DocumentElement,
    afterElementId?: string,
): DocumentElement[] => {
    if (!afterElementId) {
        return [...elements, newElement];
    }

    const index = elements.findIndex((element) => element.id === afterElementId);
    if (index === -1) {
        return [...elements, newElement];
    }

    return [
        ...elements.slice(0, index + 1),
        newElement,
        ...elements.slice(index + 1),
    ];
};

const mapSections = (
    state: DocumentAST,
    mapper: (section: DocumentSection) => DocumentSection,
): DocumentAST => ({
    ...state,
    sections: state.sections.map(mapper),
});

const mapContentElements = (
    state: DocumentAST,
    mapper: (element: DocumentElement) => DocumentElement,
): DocumentAST =>
    mapSections(state, (section) => {
        if (section.type !== "Content") {
            return section;
        }

        return {
            ...section,
            elements: section.elements.map(mapper),
        };
    });

const paragraphWithText = (
    paragraph: ParagraphElement,
    text: string,
): ParagraphElement => ({
    ...paragraph,
    content: text ? [createRichText(text)] : [],
});

export function astReducer(state: DocumentAST, action: ASTAction): DocumentAST {
    switch (action.type) {
        case "LOAD_DOCUMENT":
            return action.payload.ast;

        case "UPDATE_PROJECT_TITLE":
            return {
                ...state,
                metadata: {
                    ...state.metadata,
                    title: action.payload.title,
                },
            };

        case "UPDATE_PROJECT_SETTINGS":
            return {
                ...state,
                metadata: {
                    ...state.metadata,
                    project_settings: action.payload.settings,
                },
            };

        case "UPDATE_COVER_PAGE_ABSTRACT": {
            const { sectionId, abstractText } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "CoverPage" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    abstract_text: abstractText,
                };
            });
        }

        case "UPDATE_COVER_PAGE_AFFILIATIONS": {
            const { sectionId, affiliations } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "CoverPage" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    affiliations,
                };
            });
        }

        case "ADD_AUTHOR": {
            const { sectionId } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "CoverPage" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    authors: [
                        ...section.authors,
                        {
                            name: "",
                            email: null,
                        },
                    ],
                };
            });
        }

        case "UPDATE_AUTHOR": {
            const { sectionId, authorIndex, field, value } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "CoverPage" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    authors: section.authors.map((author, index) => {
                        if (index !== authorIndex) {
                            return author;
                        }

                        return {
                            ...author,
                            [field]: field === "email" && value.trim() === "" ? null : value,
                        };
                    }),
                };
            });
        }

        case "REMOVE_AUTHOR": {
            const { sectionId, authorIndex } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "CoverPage" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    authors: section.authors.filter((_, index) => index !== authorIndex),
                };
            });
        }

        case "ADD_PARAGRAPH": {
            const { sectionId, paragraphId, afterElementId } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "Content" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    elements: insertElement(
                        section.elements,
                        createParagraph("", paragraphId),
                        afterElementId,
                    ),
                };
            });
        }

        case "ADD_HEADING": {
            const { sectionId, headingId, level = 1, afterElementId } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "Content" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    elements: insertElement(
                        section.elements,
                        createHeading(level, "", headingId),
                        afterElementId,
                    ),
                };
            });
        }

        case "ADD_TABLE": {
            const { sectionId, tableId, afterElementId } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "Content" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    elements: insertElement(
                        section.elements,
                        createTable(2, 2, tableId),
                        afterElementId,
                    ),
                };
            });
        }

        case "ADD_EQUATION": {
            const { sectionId, equationId, afterElementId } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "Content" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    elements: insertElement(
                        section.elements,
                        createEquation(equationId),
                        afterElementId,
                    ),
                };
            });
        }

        case "ADD_FIGURE": {
            const { sectionId, figureId, afterElementId } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "Content" || section.id !== sectionId) {
                    return section;
                }

                return {
                    ...section,
                    elements: insertElement(
                        section.elements,
                        createFigure(figureId),
                        afterElementId,
                    ),
                };
            });
        }

        case "UPDATE_PARAGRAPH_TEXT": {
            const { paragraphId, text } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Paragraph" || element.id !== paragraphId) {
                    return element;
                }

                return paragraphWithText(element, text);
            });
        }

        case "UPDATE_HEADING": {
            const { headingId, text, level } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Heading" || element.id !== headingId) {
                    return element;
                }

                return {
                    ...element,
                    level: level ?? element.level,
                    content: text === undefined ? element.content : text ? [createRichText(text)] : [],
                };
            });
        }

        case "UPDATE_EQUATION": {
            const { equationId, latexSource, isBlock } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Equation" || element.id !== equationId) {
                    return element;
                }

                return {
                    ...element,
                    latex_source: latexSource ?? element.latex_source,
                    is_block: isBlock ?? element.is_block,
                };
            });
        }

        case "UPDATE_TABLE_CELL": {
            const { tableId, rowIndex, colIndex, text } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Table" || element.id !== tableId) {
                    return element;
                }

                return {
                    ...element,
                    cells: element.cells.map((row, currentRowIndex) =>
                        currentRowIndex === rowIndex
                            ? row.map((cell, currentColIndex) =>
                                  currentColIndex === colIndex
                                      ? { ...cell, content: text }
                                      : cell,
                              )
                            : row,
                    ),
                };
            });
        }

        case "ADD_TABLE_ROW": {
            const { tableId } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Table" || element.id !== tableId) {
                    return element;
                }

                return {
                    ...element,
                    rows: element.rows + 1,
                    cells: [
                        ...element.cells,
                        Array.from({ length: element.cols }, () => ({
                            content: "",
                            row_span: null,
                            col_span: null,
                        })),
                    ],
                };
            });
        }

        case "REMOVE_TABLE_ROW": {
            const { tableId, rowIndex } = action.payload;

            return mapContentElements(state, (element) => {
                if (
                    element.type !== "Table" ||
                    element.id !== tableId ||
                    element.rows <= 1
                ) {
                    return element;
                }

                return {
                    ...element,
                    rows: element.rows - 1,
                    cells: element.cells.filter((_, index) => index !== rowIndex),
                };
            });
        }

        case "ADD_TABLE_COLUMN": {
            const { tableId } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Table" || element.id !== tableId) {
                    return element;
                }

                return {
                    ...element,
                    cols: element.cols + 1,
                    cells: element.cells.map((row) => [
                        ...row,
                        {
                            content: "",
                            row_span: null,
                            col_span: null,
                        },
                    ]),
                    column_sizes: [...element.column_sizes, "1fr"],
                };
            });
        }

        case "REMOVE_TABLE_COLUMN": {
            const { tableId, colIndex } = action.payload;

            return mapContentElements(state, (element) => {
                if (
                    element.type !== "Table" ||
                    element.id !== tableId ||
                    element.cols <= 1
                ) {
                    return element;
                }

                return {
                    ...element,
                    cols: element.cols - 1,
                    cells: element.cells.map((row) =>
                        row.filter((_, index) => index !== colIndex),
                    ),
                    column_sizes: element.column_sizes.filter(
                        (_, index) => index !== colIndex,
                    ),
                };
            });
        }

        case "UPDATE_TABLE_COLUMN_SIZE": {
            const { tableId, colIndex, size } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Table" || element.id !== tableId) {
                    return element;
                }

                return {
                    ...element,
                    column_sizes: element.column_sizes.map((columnSize, index) =>
                        index === colIndex ? size : columnSize,
                    ),
                };
            });
        }

        case "UPDATE_FIGURE": {
            const { figureId, caption, placement, bodyText } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Figure" || element.id !== figureId) {
                    return element;
                }

                const content =
                    bodyText === undefined
                        ? element.content
                        : element.content.type === "Paragraph"
                          ? paragraphWithText(element.content, bodyText)
                          : createParagraph(bodyText);

                return {
                    ...element,
                    caption: caption ?? element.caption,
                    placement: placement ?? element.placement,
                    content,
                };
            });
        }

        case "REMOVE_ELEMENT": {
            const { elementId } = action.payload;

            return mapSections(state, (section) => {
                if (section.type !== "Content") {
                    return section;
                }

                return {
                    ...section,
                    elements: section.elements.filter((element) => element.id !== elementId),
                };
            });
        }

        default:
            return state;
    }
}
