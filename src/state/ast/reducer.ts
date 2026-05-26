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
import { convertElement } from "./convertElement";
import { trailingParagraphAction } from "../../editor/ensureTrailingParagraph";
import { applyMinimumContentParagraph } from "./contentInvariant";

type ParagraphElement = Extract<DocumentElement, { type: "Paragraph" }>;

function setValueAtPath(obj: any, pathParts: string[], value: any): any {
    if (pathParts.length === 0) {
        return value;
    }

    const [current, ...rest] = pathParts;

    if (Array.isArray(obj)) {
        const index = parseInt(current, 10);
        if (isNaN(index)) {
            throw new Error(`Invalid array index in path: ${current}`);
        }
        const nextArray = [...obj];
        while (nextArray.length <= index) {
            nextArray.push(null);
        }
        nextArray[index] = setValueAtPath(nextArray[index], rest, value);
        return nextArray;
    } else {
        const nextObj = { ...obj };
        nextObj[current] = setValueAtPath(nextObj[current], rest, value);
        return nextObj;
    }
}

function getValueAtPath(obj: any, pathParts: string[]): any {
    let current = obj;
    for (const part of pathParts) {
        if (current === undefined || current === null) {
            return undefined;
        }
        if (Array.isArray(current)) {
            const index = parseInt(part, 10);
            current = current[index];
        } else {
            current = current[part];
        }
    }
    return current;
}

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

const withTrailingParagraph = (ast: DocumentAST): DocumentAST => {
    const trailingAction = trailingParagraphAction(ast);
    if (!trailingAction) {
        return ast;
    }

    return astReducer(ast, trailingAction);
};

export function astReducer(state: DocumentAST, action: ASTAction): DocumentAST {
    switch (action.type) {
        case "LOAD_DOCUMENT":
            return applyMinimumContentParagraph(action.payload.ast);

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

        case "UPDATE_TEMPLATE_VARIANT":
            return {
                ...state,
                metadata: {
                    ...state.metadata,
                    template_variant_id: action.payload.variantId,
                },
            };

        case "UPDATE_INPUT": {
            const { path, value } = action.payload;
            const pathParts = path.split("/").filter(Boolean);
            const nextInputs = setValueAtPath(state.inputs, pathParts, value);
            const nextMetadata = { ...state.metadata };
            if (path === "/title" || path === "title") {
                nextMetadata.title = value;
            }
            if (path === "/keywords" || pathParts[0] === "keywords") {
                nextMetadata.keywords = Array.isArray(value)
                    ? value.map((entry) => String(entry))
                    : [];
            }
            return {
                ...state,
                inputs: nextInputs,
                metadata: nextMetadata,
            };
        }

        case "INSERT_INPUT_ARRAY_ITEM": {
            const { path, index, value } = action.payload;
            const pathParts = path.split("/").filter(Boolean);
            const currentArray = getValueAtPath(state.inputs, pathParts) ?? [];
            if (!Array.isArray(currentArray)) {
                throw new Error(`Path ${path} does not point to an array`);
            }
            const nextArray = [...currentArray];
            nextArray.splice(index, 0, value);
            return {
                ...state,
                inputs: setValueAtPath(state.inputs, pathParts, nextArray),
            };
        }

        case "REMOVE_INPUT_ARRAY_ITEM": {
            const { path, index } = action.payload;
            const pathParts = path.split("/").filter(Boolean);
            const currentArray = getValueAtPath(state.inputs, pathParts);
            if (!Array.isArray(currentArray)) {
                throw new Error(`Path ${path} does not point to an array`);
            }
            const nextArray = currentArray.filter((_, idx) => idx !== index);
            return {
                ...state,
                inputs: setValueAtPath(state.inputs, pathParts, nextArray),
            };
        }

        case "UPDATE_CUSTOM_ELEMENT_FIELD": {
            const { elementId, field, value } = action.payload;
            return mapContentElements(state, (element) => {
                if (element.type !== "Custom" || element.id !== elementId) {
                    return element;
                }
                const fields = { ...element.fields };
                if (value === null || value === undefined) {
                    delete fields[field];
                } else {
                    fields[field] = value;
                }
                return {
                    ...element,
                    fields,
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

        case "UPDATE_PARAGRAPH_CONTENT": {
            const { paragraphId, content } = action.payload;

            return withTrailingParagraph(
                mapContentElements(state, (element) => {
                    if (element.type !== "Paragraph" || element.id !== paragraphId) {
                        return element;
                    }

                    return {
                        ...element,
                        content,
                    };
                }),
            );
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

        case "UPDATE_HEADING_CONTENT": {
            const { headingId, content, level } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Heading" || element.id !== headingId) {
                    return element;
                }

                return {
                    ...element,
                    level: level ?? element.level,
                    content,
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
            const { tableId, rowIndex } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Table" || element.id !== tableId) {
                    return element;
                }

                const insertAt = rowIndex ?? element.cells.length;
                const newRow = Array.from({ length: element.cols }, () => ({
                    content: "",
                    row_span: null,
                    col_span: null,
                }));

                return {
                    ...element,
                    rows: element.rows + 1,
                    cells: [
                        ...element.cells.slice(0, insertAt),
                        newRow,
                        ...element.cells.slice(insertAt),
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
            const { tableId, colIndex } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.type !== "Table" || element.id !== tableId) {
                    return element;
                }

                const insertAt = colIndex ?? element.column_sizes.length;
                const emptyCell = {
                    content: "",
                    row_span: null,
                    col_span: null,
                };

                return {
                    ...element,
                    cols: element.cols + 1,
                    cells: element.cells.map((row) => [
                        ...row.slice(0, insertAt),
                        emptyCell,
                        ...row.slice(insertAt),
                    ]),
                    column_sizes: [
                        ...element.column_sizes.slice(0, insertAt),
                        "1fr",
                        ...element.column_sizes.slice(insertAt),
                    ],
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
            const { figureId, caption, placement, bodyText, assetId } = action.payload;

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
                    asset_id: assetId ?? element.asset_id,
                    content,
                };
            });
        }

        case "UPDATE_ELEMENT_EXTRA_FIELD": {
            const { elementId, fieldKey, fieldValue } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.id !== elementId) {
                    return element;
                }

                if (element.type === "Table" || element.type === "Figure") {
                    const extraFields = { ...element.extra_fields };
                    if (fieldValue.trim() === "") {
                        delete extraFields[fieldKey];
                    } else {
                        extraFields[fieldKey] = fieldValue;
                    }

                    return {
                        ...element,
                        extra_fields: extraFields,
                    };
                }

                return element;
            });
        }

        case "ADD_REFERENCE":
            return {
                ...state,
                references: [...state.references, action.payload.reference],
            };

        case "UPDATE_REFERENCE":
            return {
                ...state,
                references: state.references.map((reference) =>
                    reference.id === action.payload.reference.id
                        ? action.payload.reference
                        : reference,
                ),
            };

        case "REMOVE_REFERENCE":
            return {
                ...state,
                references: state.references.filter(
                    (reference) => reference.id !== action.payload.referenceId,
                ),
            };

        case "ADD_ASSET":
            return {
                ...state,
                assets: [...state.assets, action.payload.asset],
            };

        case "UPDATE_ASSET":
            return {
                ...state,
                assets: state.assets.map((asset) =>
                    asset.id === action.payload.asset.id ? action.payload.asset : asset,
                ),
            };

        case "REMOVE_ASSET":
            return {
                ...state,
                assets: state.assets.filter(
                    (asset) => asset.id !== action.payload.assetId,
                ),
            };

        case "CONVERT_ELEMENT": {
            const { elementId, targetKind } = action.payload;

            return mapContentElements(state, (element) => {
                if (element.id !== elementId) {
                    return element;
                }

                return convertElement(element, targetKind);
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
                    elements: section.elements.filter(
                        (element) => element.id !== elementId,
                    ),
                };
            });
        }

        default:
            return state;
    }
}
