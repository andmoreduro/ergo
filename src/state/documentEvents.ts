import type { Author } from "../bindings/Author";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { Table } from "../bindings/Table";
import type { TableCell } from "../bindings/TableCell";
import type { ASTAction } from "./ast/actions";
import { createRichText } from "./ast/defaults";

type TableElement = Extract<DocumentElement, { type: "Table" }>;

export interface DocumentEventHistoryEntry {
    forwardEvent: DocumentEvent;
    inverseEvent: DocumentEvent;
    timestamp: number;
}

export const createDocumentEventHistoryEntry = (
    previousAst: DocumentAST,
    action: ASTAction,
    nextAst: DocumentAST,
): DocumentEventHistoryEntry => ({
    forwardEvent: documentEventFromAction(previousAst, action, nextAst),
    inverseEvent: inverseDocumentEventFromAction(previousAst, action, nextAst),
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

        case "updateCoverAbstract":
            return mapSections(ast, (section) =>
                section.type === "CoverPage" && section.id === event.section_id
                    ? { ...section, abstract_text: event.text }
                    : section,
            );

        case "updateCoverAffiliations":
            return mapSections(ast, (section) =>
                section.type === "CoverPage" && section.id === event.section_id
                    ? { ...section, affiliations: [...event.affiliations] }
                    : section,
            );

        case "insertAuthor":
        case "restoreAuthor":
            return mapSections(ast, (section) => {
                if (section.type !== "CoverPage" || section.id !== event.section_id) {
                    return section;
                }
                const authors = [...section.authors];
                authors.splice(event.type === "insertAuthor" ? event.index : event.author_index, 0, cloneValue(event.author));
                return { ...section, authors };
            });

        case "updateAuthor":
            return mapSections(ast, (section) => {
                if (section.type !== "CoverPage" || section.id !== event.section_id) {
                    return section;
                }
                return {
                    ...section,
                    authors: section.authors.map((author, index) =>
                        index === event.author_index
                            ? {
                                  ...author,
                                  [event.field]:
                                      event.field === "email" && event.value.trim() === ""
                                          ? null
                                          : event.value,
                              }
                            : author,
                    ),
                };
            });

        case "removeAuthor":
            return mapSections(ast, (section) =>
                section.type === "CoverPage" && section.id === event.section_id
                    ? {
                          ...section,
                          authors: section.authors.filter(
                              (_, index) => index !== event.author_index,
                          ),
                      }
                    : section,
            );

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

        case "updateEquation":
            return mapContentElements(ast, event.element_id, (element) =>
                element.type === "Equation"
                    ? {
                          ...element,
                          latex_source: event.latex_source ?? element.latex_source,
                          is_block: event.is_block ?? element.is_block,
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
                                            ? { ...cell, content: event.text }
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

        default:
            return assertNever(event);
    }
};

const documentEventFromAction = (
    previousAst: DocumentAST,
    action: ASTAction,
    nextAst: DocumentAST,
): DocumentEvent => {
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

        case "UPDATE_COVER_PAGE_ABSTRACT":
            return {
                type: "updateCoverAbstract",
                section_id: action.payload.sectionId,
                text: action.payload.abstractText,
            };

        case "UPDATE_COVER_PAGE_AFFILIATIONS":
            return {
                type: "updateCoverAffiliations",
                section_id: action.payload.sectionId,
                affiliations: action.payload.affiliations,
            };

        case "ADD_AUTHOR": {
            const previousCover = coverSection(previousAst, action.payload.sectionId);
            const nextCover = coverSection(nextAst, action.payload.sectionId);
            const index = previousCover.authors.length;
            return {
                type: "insertAuthor",
                section_id: action.payload.sectionId,
                index,
                author: authorAt(nextCover.authors, index),
            };
        }

        case "UPDATE_AUTHOR":
            return {
                type: "updateAuthor",
                section_id: action.payload.sectionId,
                author_index: action.payload.authorIndex,
                field: action.payload.field,
                value: action.payload.value,
            };

        case "REMOVE_AUTHOR":
            return {
                type: "removeAuthor",
                section_id: action.payload.sectionId,
                author_index: action.payload.authorIndex,
            };

        case "ADD_PARAGRAPH":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.paragraphId);

        case "ADD_HEADING":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.headingId);

        case "ADD_TABLE":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.tableId);

        case "ADD_EQUATION":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.equationId);

        case "ADD_FIGURE":
            return insertElementEvent(nextAst, action.payload.sectionId, action.payload.figureId);

        case "UPDATE_PARAGRAPH_TEXT":
            return {
                type: "updateParagraphText",
                element_id: action.payload.paragraphId,
                text: action.payload.text,
            };

        case "UPDATE_HEADING":
            return {
                type: "updateHeading",
                element_id: action.payload.headingId,
                text: action.payload.text ?? null,
                level: action.payload.level ?? null,
            };

        case "UPDATE_EQUATION":
            return {
                type: "updateEquation",
                element_id: action.payload.equationId,
                latex_source: action.payload.latexSource ?? null,
                is_block: action.payload.isBlock ?? null,
            };

        case "UPDATE_TABLE_CELL":
            return {
                type: "updateTableCell",
                table_id: action.payload.tableId,
                row_index: action.payload.rowIndex,
                col_index: action.payload.colIndex,
                text: action.payload.text,
            };

        case "ADD_TABLE_ROW": {
            const previousTable = tableElement(previousAst, action.payload.tableId);
            const nextTable = tableElement(nextAst, action.payload.tableId);
            const rowIndex = previousTable.cells.length;
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
            const colIndex = previousTable.column_sizes.length;
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
            };

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
): DocumentEvent => {
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

        case "UPDATE_COVER_PAGE_ABSTRACT": {
            const cover = coverSection(previousAst, action.payload.sectionId);
            return {
                type: "updateCoverAbstract",
                section_id: action.payload.sectionId,
                text: cover.abstract_text,
            };
        }

        case "UPDATE_COVER_PAGE_AFFILIATIONS": {
            const cover = coverSection(previousAst, action.payload.sectionId);
            return {
                type: "updateCoverAffiliations",
                section_id: action.payload.sectionId,
                affiliations: cover.affiliations,
            };
        }

        case "ADD_AUTHOR": {
            const index = coverSection(previousAst, action.payload.sectionId).authors.length;
            return {
                type: "removeAuthor",
                section_id: action.payload.sectionId,
                author_index: index,
            };
        }

        case "UPDATE_AUTHOR": {
            const author = authorAt(
                coverSection(previousAst, action.payload.sectionId).authors,
                action.payload.authorIndex,
            );
            return {
                type: "updateAuthor",
                section_id: action.payload.sectionId,
                author_index: action.payload.authorIndex,
                field: action.payload.field,
                value:
                    action.payload.field === "email"
                        ? author.email ?? ""
                        : author.name,
            };
        }

        case "REMOVE_AUTHOR":
            return {
                type: "restoreAuthor",
                section_id: action.payload.sectionId,
                author_index: action.payload.authorIndex,
                author: authorAt(
                    coverSection(previousAst, action.payload.sectionId).authors,
                    action.payload.authorIndex,
                ),
            };

        case "ADD_PARAGRAPH":
            return { type: "removeElement", element_id: action.payload.paragraphId };

        case "ADD_HEADING":
            return { type: "removeElement", element_id: action.payload.headingId };

        case "ADD_TABLE":
            return { type: "removeElement", element_id: action.payload.tableId };

        case "ADD_EQUATION":
            return { type: "removeElement", element_id: action.payload.equationId };

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

        case "UPDATE_HEADING": {
            const heading = headingElement(previousAst, action.payload.headingId);
            return {
                type: "updateHeading",
                element_id: action.payload.headingId,
                text: action.payload.text === undefined ? null : richTextPlainText(heading.content),
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
            };
        }

        case "UPDATE_TABLE_CELL": {
            const table = tableElement(previousAst, action.payload.tableId);
            return {
                type: "updateTableCell",
                table_id: action.payload.tableId,
                row_index: action.payload.rowIndex,
                col_index: action.payload.colIndex,
                text: tableCell(table, action.payload.rowIndex, action.payload.colIndex).content,
            };
        }

        case "ADD_TABLE_ROW": {
            const rowIndex = tableElement(previousAst, action.payload.tableId).cells.length;
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
            const colIndex = tableElement(previousAst, action.payload.tableId).column_sizes.length;
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
            };
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

const insertElementEvent = (
    ast: DocumentAST,
    sectionId: string,
    elementId: string,
): DocumentEvent => {
    const section = contentSection(ast, sectionId);
    const index = section.elements.findIndex(
        (element) => elementIdOf(element) === elementId,
    );
    if (index === -1) {
        throw new Error(`Element ${elementId} was not found in section ${sectionId}`);
    }

    return {
        type: "insertElement",
        section_id: sectionId,
        index,
        element: section.elements[index],
    };
};

const mapSections = (
    ast: DocumentAST,
    mapper: (section: DocumentAST["sections"][number]) => DocumentAST["sections"][number],
): DocumentAST => ({
    ...ast,
    sections: ast.sections.map(mapper),
});

const mapContentElements = (
    ast: DocumentAST,
    elementId: string,
    mapper: (element: DocumentElement) => DocumentElement,
): DocumentAST =>
    mapSections(ast, (section) => {
        if (section.type !== "Content") {
            return section;
        }

        return {
            ...section,
            elements: section.elements.map((element) =>
                elementIdOf(element) === elementId ? mapper(element) : element,
            ),
        };
    });

const mapTable = (
    ast: DocumentAST,
    tableId: string,
    mapper: (table: TableElement) => TableElement,
): DocumentAST =>
    mapContentElements(ast, tableId, (element) =>
        element.type === "Table" ? mapper(element) : element,
    );

const richTextFromString = (text: string) => (text ? [createRichText(text)] : []);

const insertAt = <T,>(values: T[], index: number, value: T): T[] => [
    ...values.slice(0, index),
    value,
    ...values.slice(index),
];

const cloneValue = <T,>(value: T): T => structuredClone(value);

const coverSection = (ast: DocumentAST, sectionId: string) => {
    const section = ast.sections.find(
        (entry) => entry.type === "CoverPage" && entry.id === sectionId,
    );
    if (!section || section.type !== "CoverPage") {
        throw new Error(`Cover page section ${sectionId} was not found`);
    }

    return section;
};

const contentSection = (ast: DocumentAST, sectionId: string) => {
    const section = ast.sections.find(
        (entry) => entry.type === "Content" && entry.id === sectionId,
    );
    if (!section || section.type !== "Content") {
        throw new Error(`Content section ${sectionId} was not found`);
    }

    return section;
};

const elementLocation = (ast: DocumentAST, elementId: string) => {
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }

        const index = section.elements.findIndex(
            (element) => elementIdOf(element) === elementId,
        );
        if (index !== -1) {
            return {
                section,
                index,
                element: section.elements[index],
            };
        }
    }

    throw new Error(`Element ${elementId} was not found`);
};

const elementById = (ast: DocumentAST, elementId: string): DocumentElement =>
    elementLocation(ast, elementId).element;

const paragraphElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Paragraph") {
        throw new Error(`Element ${elementId} is not a paragraph`);
    }

    return element;
};

const headingElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Heading") {
        throw new Error(`Element ${elementId} is not a heading`);
    }

    return element;
};

const equationElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Equation") {
        throw new Error(`Element ${elementId} is not an equation`);
    }

    return element;
};

const tableElement = (ast: DocumentAST, elementId: string): Table => {
    const element = elementById(ast, elementId);
    if (element.type !== "Table") {
        throw new Error(`Element ${elementId} is not a table`);
    }

    return element;
};

const figureElement = (ast: DocumentAST, elementId: string) => {
    const element = elementById(ast, elementId);
    if (element.type !== "Figure") {
        throw new Error(`Element ${elementId} is not a figure`);
    }

    return element;
};

const authorAt = (authors: Author[], index: number): Author => {
    const author = authors[index];
    if (!author) {
        throw new Error(`Author index ${index} was not found`);
    }

    return author;
};

const tableRow = (table: Table, rowIndex: number): TableCell[] => {
    const row = table.cells[rowIndex];
    if (!row) {
        throw new Error(`Table row ${rowIndex} was not found in ${table.id}`);
    }

    return row;
};

const tableColumn = (table: Table, colIndex: number): TableCell[] => {
    if (colIndex < 0 || colIndex >= table.column_sizes.length) {
        throw new Error(`Table column ${colIndex} was not found in ${table.id}`);
    }

    return table.cells.map((row) => {
        const cell = row[colIndex];
        if (!cell) {
            throw new Error(`Table column ${colIndex} was not found in ${table.id}`);
        }

        return cell;
    });
};

const tableCell = (table: Table, rowIndex: number, colIndex: number): TableCell => {
    const cell = table.cells[rowIndex]?.[colIndex];
    if (!cell) {
        throw new Error(
            `Table cell ${rowIndex},${colIndex} was not found in ${table.id}`,
        );
    }

    return cell;
};

const columnSize = (table: Table, colIndex: number): string => {
    const size = table.column_sizes[colIndex];
    if (size === undefined) {
        throw new Error(`Table column ${colIndex} was not found in ${table.id}`);
    }

    return size;
};

const richTextPlainText = (
    content: Array<{ text: string }>,
): string => content.map((entry) => entry.text).join("");

const elementIdOf = (element: DocumentElement): string => {
    switch (element.type) {
        case "Heading":
        case "Paragraph":
        case "Table":
        case "Equation":
        case "Figure":
            return element.id;
        default:
            return assertNever(element);
    }
};

const assertNever = (value: never): never => {
    throw new Error(`Unhandled document action: ${JSON.stringify(value)}`);
};
