import type { DocumentAST } from "../../../bindings/DocumentAST";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { Table } from "../../../bindings/Table";
import {
    equationSourceFieldId,
    quoteContentFieldId,
    richTextFieldId,
} from "../../fieldIds";
import { parseTableCellFieldId } from "./tableCellFocus";

export type TableCellLocation = {
    table: Table;
    row: number;
    col: number;
};

const contentTables = (ast: DocumentAST): Table[] => {
    const tables: Table[] = [];
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }
        for (const element of section.elements) {
            if (element.type === "Table") {
                tables.push(element);
            }
        }
    }
    return tables;
};

const blockMatchesField = (
    block: DocumentElement,
    elementId: string,
    fieldId: string | null,
): boolean => {
    if (!fieldId) {
        return block.id === elementId;
    }

    switch (block.type) {
        case "Paragraph":
        case "Heading":
            return (
                block.id === elementId &&
                fieldId === richTextFieldId(block.id)
            );
        case "Quote":
            return (
                block.id === elementId &&
                fieldId === quoteContentFieldId(block.id)
            );
        case "List":
        case "Enumeration": {
            if (block.id !== elementId) {
                return false;
            }
            const prefix = `${block.id}:item:`;
            return fieldId.startsWith(prefix);
        }
        case "Equation":
            return (
                block.id === elementId &&
                fieldId === equationSourceFieldId(block.id)
            );
        default:
            return false;
    }
};

const cellContainsField = (
    cell: Table["cells"][number][number],
    elementId: string,
    fieldId: string | null,
): boolean =>
    cell.elements.some((block) => blockMatchesField(block, elementId, fieldId));

/** Find a table cell that owns a preview/editor field target. */
export const locateTableCell = (
    ast: DocumentAST,
    elementId: string,
    fieldId: string | null,
): TableCellLocation | null => {
    const cellCoords = fieldId
        ? parseTableCellFieldId(fieldId, elementId)
        : null;
    if (cellCoords) {
        for (const table of contentTables(ast)) {
            if (table.id !== elementId) {
                continue;
            }
            const cell = table.cells[cellCoords.row]?.[cellCoords.col];
            if (cell) {
                return { table, row: cellCoords.row, col: cellCoords.col };
            }
        }
    }

    for (const table of contentTables(ast)) {
        if (table.id === elementId) {
            if (!fieldId) {
                return { table, row: 0, col: 0 };
            }
            for (let row = 0; row < table.cells.length; row += 1) {
                const rowCells = table.cells[row];
                if (!rowCells) {
                    continue;
                }
                for (let col = 0; col < rowCells.length; col += 1) {
                    const cell = rowCells[col];
                    if (cell && cellContainsField(cell, elementId, fieldId)) {
                        return { table, row, col };
                    }
                }
            }
            const paragraphId = fieldId.endsWith(":text")
                ? fieldId.slice(0, -":text".length)
                : null;
            if (paragraphId) {
                for (let row = 0; row < table.cells.length; row += 1) {
                    const rowCells = table.cells[row];
                    if (!rowCells) {
                        continue;
                    }
                    for (let col = 0; col < rowCells.length; col += 1) {
                        const cell = rowCells[col];
                        if (
                            cell?.elements.some(
                                (block) =>
                                    block.type === "Paragraph" &&
                                    block.id === paragraphId,
                            )
                        ) {
                            return { table, row, col };
                        }
                    }
                }
            }
            continue;
        }

        for (let row = 0; row < table.cells.length; row += 1) {
            const rowCells = table.cells[row];
            if (!rowCells) {
                continue;
            }
            for (let col = 0; col < rowCells.length; col += 1) {
                const cell = rowCells[col];
                if (cell?.elements.some((block) => block.id === elementId)) {
                    if (!fieldId || cellContainsField(cell, elementId, fieldId)) {
                        return { table, row, col };
                    }
                }
            }
        }
    }

    return null;
};

export const listItemIndexFromFieldId = (
    fieldId: string,
    listId: string,
): number | null => {
    const prefix = `${listId}:item:`;
    if (!fieldId.startsWith(prefix)) {
        return null;
    }
    const index = Number(fieldId.slice(prefix.length));
    return Number.isInteger(index) && index >= 0 ? index : null;
};
