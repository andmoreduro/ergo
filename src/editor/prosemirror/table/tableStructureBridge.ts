import { getActiveBodyView, getActiveTableCellEditor } from "../activeView";
import { isBlockEditing } from "../blockEditMode";

export interface ActiveTableCellCoords {
    tableId: string;
    row: number;
    col: number;
}

let activeTableCell: ActiveTableCellCoords | null = null;
const sessionListeners = new Set<() => void>();

const coordsEqual = (
    a: ActiveTableCellCoords | null,
    b: ActiveTableCellCoords | null,
): boolean =>
    a === b ||
    (a !== null &&
        b !== null &&
        a.tableId === b.tableId &&
        a.row === b.row &&
        a.col === b.col);

const notifySessionListeners = (): void => {
    sessionListeners.forEach((listener) => listener());
};

export const subscribeActiveTableCellSession = (
    listener: () => void,
): (() => void) => {
    sessionListeners.add(listener);
    return () => sessionListeners.delete(listener);
};

export const isActiveTableCellEditing = (): boolean => {
    if (!activeTableCell) {
        return false;
    }
    const cellEditor = getActiveTableCellEditor();
    const bodyView = getActiveBodyView();
    if (!cellEditor || !bodyView) {
        return false;
    }
    return isBlockEditing(bodyView.state, activeTableCell.tableId);
};

export const setActiveTableCellCoords = (coords: ActiveTableCellCoords | null) => {
    if (coordsEqual(activeTableCell, coords)) {
        return;
    }
    activeTableCell = coords;
    notifySessionListeners();
};

export const getActiveTableCellCoords = (): ActiveTableCellCoords | null =>
    activeTableCell;
