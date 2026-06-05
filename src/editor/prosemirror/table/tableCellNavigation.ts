import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { mergeCells, moveCellForward, selectionCell, splitCell, TableMap } from "prosemirror-tables";

export type TableCellDirection = "left" | "right" | "up" | "down";

const tableInChildDoc = (view: EditorView) => {
    const table = view.state.doc.firstChild;
    if (!table || table.type.name !== "table") {
        return null;
    }
    return table;
};

/** Move the nested table-cell caret to an adjacent grid cell. */
export const moveTableCellSelection = (
    view: EditorView,
    direction: TableCellDirection,
): boolean => {
    const { state, dispatch } = view;
    const table = tableInChildDoc(view);
    if (!table) {
        return false;
    }
    const $cell = selectionCell(state);
    if (!$cell) {
        return false;
    }

    const map = TableMap.get(table);
    const rect = map.findCell($cell.pos - 1);
    const targetRow =
        direction === "up"
            ? rect.top - 1
            : direction === "down"
              ? rect.top + 1
              : rect.top;
    const targetCol =
        direction === "left"
            ? rect.left - 1
            : direction === "right"
              ? rect.left + 1
              : rect.left;

    if (
        targetRow < 0 ||
        targetCol < 0 ||
        targetRow >= map.height ||
        targetCol >= map.width
    ) {
        return false;
    }

    const cellOffset = map.positionAt(targetRow, targetCol, table);
    const $target = state.doc.resolve(1 + cellOffset + 1);
    dispatch(
        state.tr
            .setSelection(TextSelection.between($target, moveCellForward($target)))
            .scrollIntoView(),
    );
    return true;
};

export const runMergeTableCells = (view: EditorView): boolean =>
    mergeCells(view.state, view.dispatch);

export const runSplitTableCell = (view: EditorView): boolean =>
    splitCell(view.state, view.dispatch);
