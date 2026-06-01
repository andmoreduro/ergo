import type { DocumentElement } from "../../bindings/DocumentElement";
import type { DocumentEvent } from "../../bindings/DocumentEvent";
import type { TableCell } from "../../bindings/TableCell";
import { richTextSignificantlyEqual } from "../../state/ast/commitPolicy";

export type TableElement = Extract<DocumentElement, { type: "Table" }>;

const cellEqual = (a: TableCell, b: TableCell): boolean =>
    richTextSignificantlyEqual(a.content, b.content) &&
    a.col_span === b.col_span &&
    a.row_span === b.row_span;

const rowsEqual = (a: TableCell[][], b: TableCell[][]): boolean =>
    a.length === b.length &&
    a.every((row, rowIndex) =>
        row.length === b[rowIndex].length &&
        row.every((cell, colIndex) => cellEqual(cell, b[rowIndex][colIndex])),
    );

const extrasEqual = (prev: TableElement, next: TableElement): boolean =>
    JSON.stringify(prev.extra_fields) === JSON.stringify(next.extra_fields);

const columnSizesEqual = (prev: TableElement, next: TableElement): boolean =>
    JSON.stringify(prev.column_sizes) === JSON.stringify(next.column_sizes);

const rowInsertedAt = (prev: TableElement, next: TableElement): number | null => {
    if (next.cells.length !== prev.cells.length + 1) {
        return null;
    }
    for (let rowIndex = 0; rowIndex < next.cells.length; rowIndex += 1) {
        const headOk =
            rowIndex === 0 ||
            rowsEqual(prev.cells.slice(0, rowIndex), next.cells.slice(0, rowIndex));
        const tailOk =
            rowIndex === next.cells.length - 1 ||
            rowsEqual(prev.cells.slice(rowIndex), next.cells.slice(rowIndex + 1));
        if (headOk && tailOk) {
            return rowIndex;
        }
    }
    return null;
};

const rowRemovedAt = (prev: TableElement, next: TableElement): number | null => {
    if (prev.cells.length !== next.cells.length + 1) {
        return null;
    }
    for (let rowIndex = 0; rowIndex < prev.cells.length; rowIndex += 1) {
        const headOk =
            rowIndex === 0 ||
            rowsEqual(prev.cells.slice(0, rowIndex), next.cells.slice(0, rowIndex));
        const tailOk =
            rowIndex === prev.cells.length - 1 ||
            rowsEqual(prev.cells.slice(rowIndex + 1), next.cells.slice(rowIndex));
        if (headOk && tailOk) {
            return rowIndex;
        }
    }
    return null;
};

const columnInsertedAt = (prev: TableElement, next: TableElement): number | null => {
    if (next.cols !== prev.cols + 1) {
        return null;
    }
    for (let colIndex = 0; colIndex < next.cols; colIndex += 1) {
        const matches = prev.cells.every((row, rowIndex) => {
            const nextRow = next.cells[rowIndex];
            return (
                row.length + 1 === nextRow.length &&
                row.every((cell, c) => cellEqual(cell, nextRow[c < colIndex ? c : c + 1]))
            );
        });
        if (matches) {
            return colIndex;
        }
    }
    return null;
};

const columnRemovedAt = (prev: TableElement, next: TableElement): number | null => {
    if (prev.cols !== next.cols + 1) {
        return null;
    }
    for (let colIndex = 0; colIndex < prev.cols; colIndex += 1) {
        const matches = next.cells.every((row, rowIndex) => {
            const prevRow = prev.cells[rowIndex];
            return (
                prevRow.length === row.length + 1 &&
                row.every((cell, c) =>
                    cellEqual(cell, prevRow[c < colIndex ? c : c + 1]),
                )
            );
        });
        if (matches) {
            return colIndex;
        }
    }
    return null;
};

/**
 * Map a single-table AST change to existing `DocumentEvent`s when the edit is
 * limited (one cell text, one row/col insert/remove, one column width). Span
 * merges and other multi-cell edits return null so the caller replaces the
 * whole table element.
 */
export const diffTableElement = (
    prev: TableElement,
    next: TableElement,
): { forward: DocumentEvent[]; inverse: DocumentEvent[] } | null => {
    if (prev.id !== next.id) {
        return null;
    }

    const tableId = prev.id;

    if (
        rowsEqual(prev.cells, next.cells) &&
        extrasEqual(prev, next) &&
        columnSizesEqual(prev, next) &&
        prev.rows === next.rows &&
        prev.cols === next.cols
    ) {
        return { forward: [], inverse: [] };
    }

    if (
        prev.rows === next.rows &&
        prev.cols === next.cols &&
        extrasEqual(prev, next) &&
        columnSizesEqual(prev, next)
    ) {
        let change: {
            row: number;
            col: number;
            content: TableCell["content"];
            prevContent: TableCell["content"];
        } | null = null;
        for (let rowIndex = 0; rowIndex < prev.cells.length; rowIndex += 1) {
            for (let colIndex = 0; colIndex < prev.cells[rowIndex].length; colIndex += 1) {
                const before = prev.cells[rowIndex][colIndex];
                const after = next.cells[rowIndex][colIndex];
                if (cellEqual(before, after)) {
                    continue;
                }
                if (
                    before.col_span === after.col_span &&
                    before.row_span === after.row_span &&
                    !richTextSignificantlyEqual(before.content, after.content)
                ) {
                    if (change) {
                        return null;
                    }
                    change = {
                        row: rowIndex,
                        col: colIndex,
                        content: after.content,
                        prevContent: before.content,
                    };
                    continue;
                }
                return null;
            }
        }
        if (change) {
            return {
                forward: [
                    {
                        type: "updateTableCell",
                        table_id: tableId,
                        row_index: change.row,
                        col_index: change.col,
                        content: change.content,
                    },
                ],
                inverse: [
                    {
                        type: "updateTableCell",
                        table_id: tableId,
                        row_index: change.row,
                        col_index: change.col,
                        content: change.prevContent,
                    },
                ],
            };
        }
    }

    const insertedRow = rowInsertedAt(prev, next);
    if (
        insertedRow !== null &&
        extrasEqual(prev, next) &&
        columnSizesEqual(prev, next)
    ) {
        return {
            forward: [
                {
                    type: "insertTableRow",
                    table_id: tableId,
                    row_index: insertedRow,
                    cells: next.cells[insertedRow],
                },
            ],
            inverse: [
                {
                    type: "removeTableRow",
                    table_id: tableId,
                    row_index: insertedRow,
                },
            ],
        };
    }

    const removedRow = rowRemovedAt(prev, next);
    if (
        removedRow !== null &&
        extrasEqual(prev, next) &&
        columnSizesEqual(prev, next)
    ) {
        return {
            forward: [
                {
                    type: "removeTableRow",
                    table_id: tableId,
                    row_index: removedRow,
                },
            ],
            inverse: [
                {
                    type: "restoreTableRow",
                    table_id: tableId,
                    row_index: removedRow,
                    cells: prev.cells[removedRow],
                },
            ],
        };
    }

    const insertedCol = columnInsertedAt(prev, next);
    if (insertedCol !== null && extrasEqual(prev, next)) {
        const cells = next.cells.map((row) => row[insertedCol]);
        const size = next.column_sizes[insertedCol] ?? "1fr";
        return {
            forward: [
                {
                    type: "insertTableColumn",
                    table_id: tableId,
                    col_index: insertedCol,
                    cells,
                    size,
                },
            ],
            inverse: [
                {
                    type: "removeTableColumn",
                    table_id: tableId,
                    col_index: insertedCol,
                },
            ],
        };
    }

    const removedCol = columnRemovedAt(prev, next);
    if (removedCol !== null && extrasEqual(prev, next)) {
        const cells = prev.cells.map((row) => row[removedCol]);
        const size = prev.column_sizes[removedCol] ?? "1fr";
        return {
            forward: [
                {
                    type: "removeTableColumn",
                    table_id: tableId,
                    col_index: removedCol,
                },
            ],
            inverse: [
                {
                    type: "restoreTableColumn",
                    table_id: tableId,
                    col_index: removedCol,
                    cells,
                    size,
                },
            ],
        };
    }

    if (rowsEqual(prev.cells, next.cells) && extrasEqual(prev, next) && prev.rows === next.rows && prev.cols === next.cols) {
        const widthChanges: { col: number; size: string; prevSize: string }[] = [];
        const maxCols = Math.max(prev.column_sizes.length, next.column_sizes.length);
        for (let colIndex = 0; colIndex < maxCols; colIndex += 1) {
            const before = prev.column_sizes[colIndex] ?? "1fr";
            const after = next.column_sizes[colIndex] ?? "1fr";
            if (before !== after) {
                widthChanges.push({ col: colIndex, size: after, prevSize: before });
            }
        }
        if (widthChanges.length === 1) {
            const { col, size, prevSize } = widthChanges[0];
            return {
                forward: [
                    {
                        type: "updateTableColumnSize",
                        table_id: tableId,
                        col_index: col,
                        size,
                    },
                ],
                inverse: [
                    {
                        type: "updateTableColumnSize",
                        table_id: tableId,
                        col_index: col,
                        size: prevSize,
                    },
                ],
            };
        }
    }

    return null;
};
