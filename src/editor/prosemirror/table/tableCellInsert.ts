import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { TableCell } from "../../../bindings/TableCell";
import type { ASTAction } from "../../../state/ast/actions";
import { createParagraph } from "../../../state/ast/defaults";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { locateTableCell, type TableCellLocation } from "./tableCellResolve";

export type TableCellEditContext = TableCellLocation & { tableId: string };

export const getTableCellEditContext = (
    ast: DocumentAST,
    elementId: string | null,
    fieldId: string | null,
): TableCellEditContext | null => {
    if (!elementId) {
        return null;
    }
    const located = locateTableCell(ast, elementId, fieldId);
    if (!located) {
        return null;
    }
    return {
        ...located,
        tableId: located.table.id,
    };
};

const insertBlockInCell = (
    cell: TableCell,
    block: DocumentElement,
): TableCell => ({
    ...cell,
    elements: [...cell.elements, block],
});

export const buildInsertInTableCellAction = (
    ctx: TableCellEditContext,
    block: DocumentElement,
): ASTAction => ({
    type: "UPDATE_TABLE_CELL",
    payload: {
        tableId: ctx.tableId,
        rowIndex: ctx.row,
        colIndex: ctx.col,
        elements: insertBlockInCell(
            ctx.table.cells[ctx.row]?.[ctx.col] ?? {
                elements: [createParagraph()],
                row_span: null,
                col_span: null,
            },
            block,
        ).elements,
    },
});
