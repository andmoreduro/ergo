import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { TableCell } from "../../../bindings/TableCell";
import type { ASTAction } from "../../../state/ast/actions";
import { createParagraph } from "../../../state/ast/defaults";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { isReplaceableEmptyElement } from "../../insertContext";
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

const blockMatchesFocus = (
    block: DocumentElement,
    elementId: string | null,
    fieldId: string | null,
): boolean => {
    if (!fieldId) {
        return false;
    }
    if (fieldId.endsWith(":text")) {
        const paragraphId = fieldId.slice(0, -":text".length);
        return (
            (block.type === "Paragraph" || block.type === "Heading") &&
            block.id === paragraphId
        );
    }
    if (fieldId.endsWith(":quote")) {
        return block.type === "Quote" && fieldId.startsWith(`${block.id}:quote`);
    }
    if (fieldId.endsWith(":latexSource")) {
        return block.type === "Equation" && fieldId.startsWith(`${block.id}:latexSource`);
    }
    const itemPrefix = `${block.id}:item:`;
    if (
        (block.type === "List" || block.type === "Enumeration") &&
        fieldId.startsWith(itemPrefix)
    ) {
        return true;
    }
    if (elementId && block.id === elementId) {
        return true;
    }
    return false;
};

const focusedBlockIndexInCell = (
    cell: TableCell,
    elementId: string | null,
    fieldId: string | null,
): number | null => {
    if (!fieldId) {
        return null;
    }
    for (let index = 0; index < cell.elements.length; index += 1) {
        if (blockMatchesFocus(cell.elements[index], elementId, fieldId)) {
            return index;
        }
    }
    return null;
};

const insertBlockInCell = (
    cell: TableCell,
    block: DocumentElement,
    elementId: string | null,
    fieldId: string | null,
): TableCell => {
    const elements = [...cell.elements];
    const focusIndex = focusedBlockIndexInCell(cell, elementId, fieldId);
    if (focusIndex === null) {
        return { ...cell, elements: [...elements, block] };
    }

    const focused = elements[focusIndex];
    const isBlockEquation =
        focused.type === "Equation" && focused.is_block === true;
    if (isReplaceableEmptyElement(focused) && !isBlockEquation) {
        elements.splice(focusIndex, 1, block);
        return { ...cell, elements };
    }
    if (isBlockEquation) {
        elements.splice(focusIndex + 1, 0, block);
        return { ...cell, elements };
    }
    return { ...cell, elements: [...elements, block] };
};

export const buildInsertInTableCellAction = (
    ctx: TableCellEditContext,
    block: DocumentElement,
    focus: { elementId: string | null; fieldId: string | null },
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
            focus.elementId,
            focus.fieldId,
        ).elements,
    },
});
