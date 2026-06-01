import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { ASTAction } from "./ast/actions";
import {
    assertNever,
    assetById,
    assetLocation,
    cloneValue,
    columnSize,
    elementById,
    elementIdOf,
    elementLocation,
    equationElement,
    figureElement,
    getValueAtPath,
    headingElement,
    insertAt,
    insertElementEvent,
    mapContentElements,
    mapSections,
    mapTable,
    paragraphElement,
    referenceById,
    referenceLocation,
    richTextFromString,
    richTextPlainText,
    setValueAtPath,
    tableCell,
    tableColumn,
    tableElement,
    tableRow,
} from "./documentEvents/helpers";

export interface DocumentEventHistoryEntry {
    forwardEvents: DocumentEvent[];
    inverseEvents: DocumentEvent[];
    timestamp: number;
}

const asEventList = (event: DocumentEvent | DocumentEvent[]): DocumentEvent[] =>
    Array.isArray(event) ? event : [event];

const replaceElementWith = (
    ast: DocumentAST,
    elementId: string,
    insertType: "insertElement" | "restoreElement",
): DocumentEvent[] => {
    const location = elementLocation(ast, elementId);
    return [
        {
            type: "removeElement",
            element_id: elementId,
        },
        {
            type: insertType,
            section_id: location.section.id,
            index: location.index,
            element: cloneValue(location.element),
        },
    ];
};

export const applyDocumentEvents = (
    ast: DocumentAST,
    events: DocumentEvent[],
): DocumentAST =>
    events.reduce(
        (currentAst, event) => applyDocumentEventToAst(currentAst, event),
        ast,
    );

export const createDocumentEventHistoryEntry = (
    previousAst: DocumentAST,
    action: ASTAction,
    nextAst: DocumentAST,
): DocumentEventHistoryEntry => ({
    forwardEvents: asEventList(
        documentEventFromAction(previousAst, action, nextAst),
    ),
    inverseEvents: asEventList(
        inverseDocumentEventFromAction(previousAst, action, nextAst),
    ),
    timestamp: Date.now(),
});

export const applyDocumentEventToAst = (
    ast: DocumentAST,
    event: DocumentEvent,
): DocumentAST => {
    switch (event.type) {
        case "setProjectTitle":
            return {
                ...ast,
                metadata: {
                    ...ast.metadata,
                    title: event.title,
                },
            };

        case "setProjectSettings":
            return {
                ...ast,
                metadata: {
                    ...ast.metadata,
                    project_settings: event.settings,
                },
            };

        case "setTemplateVariant":
            return {
                ...ast,
                metadata: {
                    ...ast.metadata,
                    template_variant_id: event.variant_id,
                },
            };

        case "updateInput": {
            const pathParts = event.path.split("/").filter(Boolean);
            const nextInputs = setValueAtPath<DocumentAST["inputs"]>(
                ast.inputs,
                pathParts,
                event.value,
            );
            const nextMetadata =
                event.path === "/title" || event.path === "title"
                    ? {
                          ...ast.metadata,
                          title:
                              typeof event.value === "string"
                                  ? event.value
                                  : ast.metadata.title,
                      }
                    : ast.metadata;
            return {
                ...ast,
                inputs: nextInputs,
                metadata: nextMetadata,
            };
        }

        case "insertInputArrayItem": {
            const pathParts = event.path.split("/").filter(Boolean);
            const currentArray = getValueAtPath(ast.inputs, pathParts) ?? [];
            if (!Array.isArray(currentArray)) {
                throw new Error(`Path ${event.path} does not point to an array`);
            }
            const nextArray = [...currentArray];
            nextArray.splice(event.index, 0, event.value);
            return {
                ...ast,
                inputs: setValueAtPath(ast.inputs, pathParts, nextArray),
            };
        }

        case "removeInputArrayItem": {
            const pathParts = event.path.split("/").filter(Boolean);
            const currentArray = getValueAtPath(ast.inputs, pathParts);
            if (!Array.isArray(currentArray)) {
                throw new Error(`Path ${event.path} does not point to an array`);
            }
            const nextArray = currentArray.filter((_, idx) => idx !== event.index);
            return {
                ...ast,
                inputs: setValueAtPath(ast.inputs, pathParts, nextArray),
            };
        }

        case "updateCustomElementField": {
            return mapContentElements(ast, event.element_id, (element) => {
                if (element.type !== "Custom") {
                    return element;
                }
                const fields = { ...element.fields };
                if (event.value === null || event.value === undefined) {
                    delete fields[event.field];
                } else {
                    fields[event.field] = event.value;
                }
                return {
                    ...element,
                    fields,
                };
            });
        }

        case "insertElement":
        case "restoreElement":
            return mapSections(ast, (section) => {
                if (section.type !== "Content" || section.id !== event.section_id) {
                    return section;
                }
                const elements = [...section.elements];
                elements.splice(event.index, 0, cloneValue(event.element));
                return { ...section, elements };
            });

        case "removeElement":
            return mapSections(ast, (section) =>
                section.type === "Content"
                    ? {
                          ...section,
                          elements: section.elements.filter(
                              (element) => elementIdOf(element) !== event.element_id,
                          ),
                      }
                    : section,
            );

        case "updateParagraphText":
            return mapContentElements(ast, event.element_id, (element) =>
                element.type === "Paragraph"
                    ? { ...element, content: richTextFromString(event.text) }
                    : element,
            );

        case "updateParagraphContent":
            return mapContentElements(ast, event.element_id, (element) =>
                element.type === "Paragraph"
                    ? { ...element, content: cloneValue(event.content) }
                    : element,
            );

        case "updateHeading":
            return mapContentElements(ast, event.element_id, (element) =>
                element.type === "Heading"
                    ? {
                          ...element,
                          level: event.level ?? element.level,
                          content:
                              event.text === null
                                  ? element.content
                                  : richTextFromString(event.text),
                      }
                    : element,
            );

        case "updateHeadingContent":
            return mapContentElements(ast, event.element_id, (element) =>
                element.type === "Heading"
                    ? {
                          ...element,
                          level: event.level ?? element.level,
                          content: cloneValue(event.content),
                      }
                    : element,
            );

        case "updateEquation":
            return mapContentElements(ast, event.element_id, (element) =>
                element.type === "Equation"
                    ? {
                          ...element,
                          latex_source: event.latex_source ?? element.latex_source,
                          is_block: event.is_block ?? element.is_block,
                          syntax: event.syntax ?? element.syntax,
                      }
                    : element,
            );

        case "updateTableCell":
            return mapContentElements(ast, event.table_id, (element) =>
                element.type === "Table"
                    ? {
                          ...element,
                          cells: element.cells.map((row, rowIndex) =>
                              rowIndex === event.row_index
                                  ? row.map((cell, colIndex) =>
                                        colIndex === event.col_index
                                            ? { ...cell, content: event.content }
                                            : cell,
                                    )
                                  : row,
                          ),
                      }
                    : element,
            );

        case "insertTableRow":
        case "restoreTableRow":
            return mapTable(ast, event.table_id, (table) => {
                const cells = [...table.cells];
                cells.splice(event.row_index, 0, cloneValue(event.cells));
                return { ...table, rows: cells.length, cells };
            });

        case "removeTableRow":
            return mapTable(ast, event.table_id, (table) => ({
                ...table,
                rows: Math.max(0, table.rows - 1),
                cells: table.cells.filter((_, index) => index !== event.row_index),
            }));

        case "insertTableColumn":
        case "restoreTableColumn":
            return mapTable(ast, event.table_id, (table) => ({
                ...table,
                cols: table.cols + 1,
                cells: table.cells.map((row, rowIndex) => {
                    const next = [...row];
                    next.splice(event.col_index, 0, cloneValue(event.cells[rowIndex]));
                    return next;
                }),
                column_sizes: insertAt(table.column_sizes, event.col_index, event.size),
            }));

        case "removeTableColumn":
            return mapTable(ast, event.table_id, (table) => ({
                ...table,
                cols: Math.max(0, table.cols - 1),
                cells: table.cells.map((row) =>
                    row.filter((_, index) => index !== event.col_index),
                ),
                column_sizes: table.column_sizes.filter(
                    (_, index) => index !== event.col_index,
                ),
            }));

        case "updateTableColumnSize":
            return mapTable(ast, event.table_id, (table) => ({
                ...table,
                column_sizes: table.column_sizes.map((size, index) =>
                    index === event.col_index ? event.size : size,
                ),
            }));

        case "updateFigure":
            return mapContentElements(ast, event.element_id, (element) => {
                if (element.type !== "Figure") {
                    return element;
                }
                return {
                    ...element,
                    caption: event.caption ?? element.caption,
                    placement: event.placement ?? element.placement,
                    asset_id: event.asset_id ?? element.asset_id,
                    content:
                        event.body_text === null
                            ? element.content
                            : element.content.type === "Paragraph"
                              ? {
                                    ...element.content,
                                    content: richTextFromString(event.body_text),
                                }
                              : element.content,
                };
            });
        case "updateElementExtraField":
            return mapContentElements(ast, event.element_id, (element) => {
                if (!("extra_fields" in element)) {
                    return element;
                }
                const extra_fields = { ...(element.extra_fields || {}) };
                if (event.field_value === null || event.field_value === "") {
                    delete extra_fields[event.field_key];
                } else {
                    extra_fields[event.field_key] = event.field_value;
                }
                return {
                    ...element,
                    extra_fields,
                } as typeof element;
            });

        case "insertReference":
        case "restoreReference": {
            const references = [...ast.references];
            references.splice(event.index, 0, cloneValue(event.reference));
            return {
                ...ast,
                references,
            };
        }

        case "updateReference":
            return {
                ...ast,
                references: ast.references.map((reference) =>
                    reference.id === event.reference.id
                        ? cloneValue(event.reference)
                        : reference,
                ),
            };

        case "removeReference":
            return {
                ...ast,
                references: ast.references.filter(
                    (reference) => reference.id !== event.reference_id,
                ),
            };

        case "insertAsset":
        case "restoreAsset": {
            const assets = [...ast.assets];
            assets.splice(event.index, 0, cloneValue(event.asset));
            return {
                ...ast,
                assets,
            };
        }

        case "updateAsset":
            return {
                ...ast,
                assets: ast.assets.map((asset) =>
                    asset.id === event.asset.id ? cloneValue(event.asset) : asset,
                ),
            };

        case "removeAsset":
            return {
                ...ast,
                assets: ast.assets.filter((asset) => asset.id !== event.asset_id),
            };

        default:
            return assertNever(event);
    }
};
const documentEventFromAction = (
    previousAst: DocumentAST,
    action: ASTAction,
    nextAst: DocumentAST,
): DocumentEvent | DocumentEvent[] => {
    switch (action.type) {
        case "LOAD_DOCUMENT":
            throw new Error("LOAD_DOCUMENT is a bootstrap action, not a sync event");

        case "UPDATE_PROJECT_TITLE":
            return { type: "setProjectTitle", title: action.payload.title };

        case "UPDATE_PROJECT_SETTINGS":
            return {
                type: "setProjectSettings",
                settings: action.payload.settings,
            };

        case "UPDATE_TEMPLATE_VARIANT":
            return {
                type: "setTemplateVariant",
                variant_id: action.payload.variantId,
            };

        case "UPDATE_INPUT":
            return {
                type: "updateInput",
                path: action.payload.path,
                value: action.payload.value,
            };

        case "INSERT_INPUT_ARRAY_ITEM":
            return {
                type: "insertInputArrayItem",
                path: action.payload.path,
                index: action.payload.index,
                value: action.payload.value,
            };

        case "REMOVE_INPUT_ARRAY_ITEM":
            return {
                type: "removeInputArrayItem",
                path: action.payload.path,
                index: action.payload.index,
            };

        case "UPDATE_CUSTOM_ELEMENT_FIELD":
            return {
                type: "updateCustomElementField",
                element_id: action.payload.elementId,
                field: action.payload.field,
                value: action.payload.value,
            };

        case "ADD_PARAGRAPH":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.paragraphId);

        case "ADD_HEADING":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.headingId);

        case "ADD_TABLE":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.tableId);

        case "ADD_EQUATION":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.equationId);

        case "ADD_QUOTE":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.quoteId);

        case "ADD_DIAGRAM":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.diagramId);

        case "ADD_LIST":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.listId);

        case "ADD_ENUMERATION":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.enumerationId);

        case "ADD_FIGURE":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.figureId);

        case "UPDATE_PARAGRAPH_TEXT":
            return {
                type: "updateParagraphText",
                element_id: action.payload.paragraphId,
                text: action.payload.text,
            };

        case "UPDATE_PARAGRAPH_CONTENT":
            return {
                type: "updateParagraphContent",
                element_id: action.payload.paragraphId,
                content: action.payload.content,
            };

        case "UPDATE_HEADING":
            return {
                type: "updateHeading",
                element_id: action.payload.headingId,
                text: action.payload.text ?? null,
                level: action.payload.level ?? null,
            };

        case "UPDATE_HEADING_CONTENT":
            return {
                type: "updateHeadingContent",
                element_id: action.payload.headingId,
                content: action.payload.content,
                level: action.payload.level ?? null,
            };

        case "UPDATE_EQUATION":
            return {
                type: "updateEquation",
                element_id: action.payload.equationId,
                latex_source: action.payload.latexSource ?? null,
                is_block: action.payload.isBlock ?? null,
                syntax: action.payload.syntax ?? null,
            };

        case "UPDATE_QUOTE_CONTENT":
            return replaceElementWith(nextAst, action.payload.quoteId, "insertElement");

        case "UPDATE_DIAGRAM":
            return replaceElementWith(nextAst, action.payload.diagramId, "insertElement");

        case "UPDATE_LIST_ITEM":
            return replaceElementWith(nextAst, action.payload.listId, "insertElement");

        case "UPDATE_ENUMERATION_ITEM":
            return replaceElementWith(
                nextAst,
                action.payload.enumerationId,
                "insertElement",
            );

        case "UPDATE_TABLE_CELL":
            return {
                type: "updateTableCell",
                table_id: action.payload.tableId,
                row_index: action.payload.rowIndex,
                col_index: action.payload.colIndex,
                content: action.payload.content,
            };

        case "ADD_TABLE_ROW": {
            const previousTable = tableElement(previousAst, action.payload.tableId);
            const nextTable = tableElement(nextAst, action.payload.tableId);
            const rowIndex =
                action.payload.rowIndex ?? previousTable.cells.length;
            return {
                type: "insertTableRow",
                table_id: action.payload.tableId,
                row_index: rowIndex,
                cells: tableRow(nextTable, rowIndex),
            };
        }

        case "REMOVE_TABLE_ROW":
            return {
                type: "removeTableRow",
                table_id: action.payload.tableId,
                row_index: action.payload.rowIndex,
            };

        case "ADD_TABLE_COLUMN": {
            const previousTable = tableElement(previousAst, action.payload.tableId);
            const nextTable = tableElement(nextAst, action.payload.tableId);
            const colIndex =
                action.payload.colIndex ?? previousTable.column_sizes.length;
            return {
                type: "insertTableColumn",
                table_id: action.payload.tableId,
                col_index: colIndex,
                cells: tableColumn(nextTable, colIndex),
                size: columnSize(nextTable, colIndex),
            };
        }

        case "REMOVE_TABLE_COLUMN":
            return {
                type: "removeTableColumn",
                table_id: action.payload.tableId,
                col_index: action.payload.colIndex,
            };

        case "UPDATE_TABLE_COLUMN_SIZE":
            return {
                type: "updateTableColumnSize",
                table_id: action.payload.tableId,
                col_index: action.payload.colIndex,
                size: action.payload.size,
            };

        case "UPDATE_FIGURE":
            return {
                type: "updateFigure",
                element_id: action.payload.figureId,
                caption: action.payload.caption ?? null,
                placement: action.payload.placement ?? null,
                body_text: action.payload.bodyText ?? null,
                asset_id: action.payload.assetId ?? null,
            };

        case "UPDATE_ELEMENT_EXTRA_FIELD": {
            const { fieldValue } = action.payload;
            const fieldIsEmpty =
                fieldValue === null ||
                fieldValue === undefined ||
                (typeof fieldValue === "string" && fieldValue.trim() === "") ||
                (Array.isArray(fieldValue) && fieldValue.length === 0);

            return {
                type: "updateElementExtraField",
                element_id: action.payload.elementId,
                field_key: action.payload.fieldKey,
                field_value: fieldIsEmpty ? null : fieldValue,
            };
        }

        case "ADD_REFERENCE":
            return {
                type: "insertReference",
                index: nextAst.references.findIndex(
                    (reference) => reference.id === action.payload.reference.id,
                ),
                reference: action.payload.reference,
            };

        case "UPDATE_REFERENCE":
            return {
                type: "updateReference",
                reference: action.payload.reference,
            };

        case "REMOVE_REFERENCE":
            return {
                type: "removeReference",
                reference_id: action.payload.referenceId,
            };

        case "ADD_ASSET":
            return {
                type: "insertAsset",
                index: nextAst.assets.findIndex(
                    (asset) => asset.id === action.payload.asset.id,
                ),
                asset: action.payload.asset,
            };

        case "UPDATE_ASSET":
            return {
                type: "updateAsset",
                asset: action.payload.asset,
            };

        case "REMOVE_ASSET":
            return {
                type: "removeAsset",
                asset_id: action.payload.assetId,
            };

        case "CONVERT_ELEMENT": {
            const location = elementLocation(nextAst, action.payload.elementId);
            return [
                {
                    type: "removeElement",
                    element_id: action.payload.elementId,
                },
                {
                    type: "insertElement",
                    section_id: location.section.id,
                    index: location.index,
                    element: cloneValue(location.element),
                },
            ];
        }

        case "REMOVE_ELEMENT":
            return {
                type: "removeElement",
                element_id: action.payload.elementId,
            };

        default:
            return assertNever(action);
    }
};

const inverseDocumentEventFromAction = (
    previousAst: DocumentAST,
    action: ASTAction,
    _nextAst: DocumentAST,
): DocumentEvent | DocumentEvent[] => {
    switch (action.type) {
        case "LOAD_DOCUMENT":
            throw new Error("LOAD_DOCUMENT is a bootstrap action, not a sync event");

        case "UPDATE_PROJECT_TITLE":
            return { type: "setProjectTitle", title: previousAst.metadata.title };

        case "UPDATE_PROJECT_SETTINGS":
            return {
                type: "setProjectSettings",
                settings: previousAst.metadata.project_settings,
            };

        case "UPDATE_TEMPLATE_VARIANT":
            return {
                type: "setTemplateVariant",
                variant_id: previousAst.metadata.template_variant_id ?? "student",
            };

        case "UPDATE_INPUT": {
            const pathParts = action.payload.path.split("/").filter(Boolean);
            const prevValue = getValueAtPath(previousAst.inputs, pathParts) ?? null;
            return {
                type: "updateInput",
                path: action.payload.path,
                value: prevValue,
            };
        }

        case "INSERT_INPUT_ARRAY_ITEM":
            return {
                type: "removeInputArrayItem",
                path: action.payload.path,
                index: action.payload.index,
            };

        case "REMOVE_INPUT_ARRAY_ITEM": {
            const pathParts = action.payload.path.split("/").filter(Boolean);
            const currentArray = getValueAtPath(previousAst.inputs, pathParts);
            const prevValue = Array.isArray(currentArray) ? currentArray[action.payload.index] : null;
            return {
                type: "insertInputArrayItem",
                path: action.payload.path,
                index: action.payload.index,
                value: prevValue,
            };
        }

        case "UPDATE_CUSTOM_ELEMENT_FIELD": {
            const element = elementById(previousAst, action.payload.elementId);
            if (element.type !== "Custom") {
                throw new Error(`Element ${action.payload.elementId} is not a custom element`);
            }
            const prevValue = element.fields[action.payload.field] ?? null;
            return {
                type: "updateCustomElementField",
                element_id: action.payload.elementId,
                field: action.payload.field,
                value: prevValue,
            };
        }

        case "ADD_PARAGRAPH":
            return { type: "removeElement", element_id: action.payload.paragraphId };

        case "ADD_HEADING":
            return { type: "removeElement", element_id: action.payload.headingId };

        case "ADD_TABLE":
            return { type: "removeElement", element_id: action.payload.tableId };

        case "ADD_EQUATION":
            return { type: "removeElement", element_id: action.payload.equationId };

        case "ADD_QUOTE":
            return { type: "removeElement", element_id: action.payload.quoteId };

        case "ADD_DIAGRAM":
            return { type: "removeElement", element_id: action.payload.diagramId };

        case "ADD_LIST":
            return { type: "removeElement", element_id: action.payload.listId };

        case "ADD_ENUMERATION":
            return { type: "removeElement", element_id: action.payload.enumerationId };

        case "ADD_FIGURE":
            return { type: "removeElement", element_id: action.payload.figureId };

        case "UPDATE_PARAGRAPH_TEXT": {
            const paragraph = paragraphElement(previousAst, action.payload.paragraphId);
            return {
                type: "updateParagraphText",
                element_id: action.payload.paragraphId,
                text: richTextPlainText(paragraph.content),
            };
        }

        case "UPDATE_PARAGRAPH_CONTENT": {
            const paragraph = paragraphElement(previousAst, action.payload.paragraphId);
            return {
                type: "updateParagraphContent",
                element_id: action.payload.paragraphId,
                content: cloneValue(paragraph.content),
            };
        }

        case "UPDATE_HEADING": {
            const heading = headingElement(previousAst, action.payload.headingId);
            return {
                type: "updateHeading",
                element_id: action.payload.headingId,
                text: action.payload.text === undefined ? null : richTextPlainText(heading.content),
                level: action.payload.level === undefined ? null : heading.level,
            };
        }

        case "UPDATE_HEADING_CONTENT": {
            const heading = headingElement(previousAst, action.payload.headingId);
            return {
                type: "updateHeadingContent",
                element_id: action.payload.headingId,
                content: cloneValue(heading.content),
                level: action.payload.level === undefined ? null : heading.level,
            };
        }

        case "UPDATE_EQUATION": {
            const equation = equationElement(previousAst, action.payload.equationId);
            return {
                type: "updateEquation",
                element_id: action.payload.equationId,
                latex_source:
                    action.payload.latexSource === undefined ? null : equation.latex_source,
                is_block: action.payload.isBlock === undefined ? null : equation.is_block,
                syntax: action.payload.syntax === undefined ? null : equation.syntax,
            };
        }

        case "UPDATE_QUOTE_CONTENT":
            return replaceElementWith(previousAst, action.payload.quoteId, "restoreElement");

        case "UPDATE_DIAGRAM":
            return replaceElementWith(previousAst, action.payload.diagramId, "restoreElement");

        case "UPDATE_LIST_ITEM":
            return replaceElementWith(previousAst, action.payload.listId, "restoreElement");

        case "UPDATE_ENUMERATION_ITEM":
            return replaceElementWith(
                previousAst,
                action.payload.enumerationId,
                "restoreElement",
            );

        case "UPDATE_TABLE_CELL": {
            const table = tableElement(previousAst, action.payload.tableId);
            return {
                type: "updateTableCell",
                table_id: action.payload.tableId,
                row_index: action.payload.rowIndex,
                col_index: action.payload.colIndex,
                content: tableCell(table, action.payload.rowIndex, action.payload.colIndex).content,
            };
        }

        case "ADD_TABLE_ROW": {
            const previousTable = tableElement(previousAst, action.payload.tableId);
            const rowIndex =
                action.payload.rowIndex ?? previousTable.cells.length;
            return {
                type: "removeTableRow",
                table_id: action.payload.tableId,
                row_index: rowIndex,
            };
        }

        case "REMOVE_TABLE_ROW": {
            const table = tableElement(previousAst, action.payload.tableId);
            return {
                type: "restoreTableRow",
                table_id: action.payload.tableId,
                row_index: action.payload.rowIndex,
                cells: tableRow(table, action.payload.rowIndex),
            };
        }

        case "ADD_TABLE_COLUMN": {
            const previousTable = tableElement(previousAst, action.payload.tableId);
            const colIndex =
                action.payload.colIndex ?? previousTable.column_sizes.length;
            return {
                type: "removeTableColumn",
                table_id: action.payload.tableId,
                col_index: colIndex,
            };
        }

        case "REMOVE_TABLE_COLUMN": {
            const table = tableElement(previousAst, action.payload.tableId);
            return {
                type: "restoreTableColumn",
                table_id: action.payload.tableId,
                col_index: action.payload.colIndex,
                cells: tableColumn(table, action.payload.colIndex),
                size: columnSize(table, action.payload.colIndex),
            };
        }

        case "UPDATE_TABLE_COLUMN_SIZE": {
            const table = tableElement(previousAst, action.payload.tableId);
            return {
                type: "updateTableColumnSize",
                table_id: action.payload.tableId,
                col_index: action.payload.colIndex,
                size: columnSize(table, action.payload.colIndex),
            };
        }

        case "UPDATE_FIGURE": {
            const figure = figureElement(previousAst, action.payload.figureId);
            return {
                type: "updateFigure",
                element_id: action.payload.figureId,
                caption: action.payload.caption === undefined ? null : figure.caption,
                placement: action.payload.placement === undefined ? null : figure.placement,
                body_text:
                    action.payload.bodyText === undefined
                        ? null
                        : figure.content.type === "Paragraph"
                          ? richTextPlainText(figure.content.content)
                          : "",
                asset_id:
                    action.payload.assetId === undefined ? null : figure.asset_id,
            };
        }

        case "UPDATE_ELEMENT_EXTRA_FIELD": {
            const element = elementById(previousAst, action.payload.elementId);
            if (
                element.type !== "Table" &&
                element.type !== "Figure" &&
                element.type !== "Diagram"
            ) {
                throw new Error(`Element ${action.payload.elementId} does not have extra fields`);
            }
            const prevValue = element.extra_fields?.[action.payload.fieldKey] ?? null;
            return {
                type: "updateElementExtraField",
                element_id: action.payload.elementId,
                field_key: action.payload.fieldKey,
                field_value: prevValue,
            };
        }

        case "ADD_REFERENCE":
            return {
                type: "removeReference",
                reference_id: action.payload.reference.id,
            };

        case "UPDATE_REFERENCE":
            return {
                type: "updateReference",
                reference: referenceById(previousAst, action.payload.reference.id),
            };

        case "REMOVE_REFERENCE": {
            const location = referenceLocation(previousAst, action.payload.referenceId);
            return {
                type: "restoreReference",
                index: location.index,
                reference: location.reference,
            };
        }

        case "ADD_ASSET":
            return {
                type: "removeAsset",
                asset_id: action.payload.asset.id,
            };

        case "UPDATE_ASSET":
            return {
                type: "updateAsset",
                asset: assetById(previousAst, action.payload.asset.id),
            };

        case "REMOVE_ASSET": {
            const location = assetLocation(previousAst, action.payload.assetId);
            return {
                type: "restoreAsset",
                index: location.index,
                asset: location.asset,
            };
        }

        case "CONVERT_ELEMENT": {
            const location = elementLocation(previousAst, action.payload.elementId);
            return [
                {
                    type: "removeElement",
                    element_id: action.payload.elementId,
                },
                {
                    type: "restoreElement",
                    section_id: location.section.id,
                    index: location.index,
                    element: cloneValue(location.element),
                },
            ];
        }

        case "REMOVE_ELEMENT": {
            const location = elementLocation(previousAst, action.payload.elementId);
            return {
                type: "restoreElement",
                section_id: location.section.id,
                index: location.index,
                element: location.element,
            };
        }

        default:
            return assertNever(action);
    }
};
