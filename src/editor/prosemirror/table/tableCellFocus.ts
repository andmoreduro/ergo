import type { Node as PMNode } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";
import { TextSelection } from "prosemirror-state";
import { selectionCell, TableMap } from "prosemirror-tables";
import { tableCellFieldId } from "../../fieldIds";
import { fieldCaretOffsetFromNode, pmPosForFieldCaret } from "../astBridge";
import type { BodyFocusTarget } from "../selection";

export interface TableCellCoords {
    row: number;
    col: number;
    cellNode: PMNode;
    /** Field-scoped UTF-16 caret offset inside the cell. */
    caretUtf16Offset: number;
}

const tableNodeInChildDoc = (doc: PMNode): PMNode | null => {
    const table = doc.firstChild;
    return table?.type.name === "table" ? table : null;
};

/** Map a child-table selection to grid coordinates and in-cell caret offset. */
export const tableCellCoordsFromChildState = (
    state: EditorState,
): TableCellCoords | null => {
    const table = tableNodeInChildDoc(state.doc);
    if (!table) {
        return null;
    }
    const $cell = selectionCell(state);
    if (!$cell) {
        return null;
    }
    const map = TableMap.get(table);
    const tableStart = 1;
    const cellRect = map.findCell($cell.pos - tableStart);
    const cellNode = $cell.node();
    const $head = state.selection.$head;
    const fieldNode = $head.parent === cellNode ? cellNode : $head.parent;
    return {
        row: cellRect.top,
        col: cellRect.left,
        cellNode,
        caretUtf16Offset: fieldCaretOffsetFromNode(
            fieldNode,
            $head.parentOffset,
        ),
    };
};

export const focusTargetForTableCell = (
    tableId: string,
    coords: TableCellCoords,
): BodyFocusTarget => ({
    elementId: tableId,
    fieldId: tableCellFieldId(tableId, coords.row, coords.col),
    caretUtf16Offset: coords.caretUtf16Offset,
});

export const isTableCellFieldId = (
    fieldId: string | null,
    elementId: string,
): boolean => fieldId?.startsWith(`${elementId}:cell:`) ?? false;

export const parseTableCellFieldId = (
    fieldId: string,
    elementId: string,
): { row: number; col: number } | null => {
    const prefix = `${elementId}:cell:`;
    if (!fieldId.startsWith(prefix)) {
        return null;
    }
    const parts = fieldId.slice(prefix.length).split(":");
    const row = Number(parts[0]);
    const col = Number(parts[1]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
        return null;
    }
    return { row, col };
};

/** Place the child-table caret at a preview/sidebar focus target. */
export const selectionInChildTableForFocus = (
    doc: PMNode,
    target: BodyFocusTarget,
): TextSelection | null => {
    const parsed = target.fieldId
        ? parseTableCellFieldId(target.fieldId, target.elementId)
        : null;
    if (!parsed) {
        return null;
    }
    const table = tableNodeInChildDoc(doc);
    if (!table) {
        return null;
    }
    const map = TableMap.get(table);
    const tableStart = 1;
    const cellPos = tableStart + map.positionAt(parsed.row, parsed.col, table);
    const $cell = doc.resolve(cellPos);
    const cellNode = $cell.nodeAfter ?? $cell.parent;
    if (!cellNode) {
        return null;
    }
    const offset = pmPosForFieldCaret(cellNode, target.caretUtf16Offset ?? 0);
    const pos = cellPos + 1 + offset;
    return TextSelection.create(doc, pos);
};
