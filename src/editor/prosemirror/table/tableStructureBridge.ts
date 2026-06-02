export interface ActiveTableCellCoords {
    tableId: string;
    row: number;
    col: number;
}

let activeTableCell: ActiveTableCellCoords | null = null;

export const setActiveTableCellCoords = (coords: ActiveTableCellCoords | null) => {
    activeTableCell = coords;
};

export const getActiveTableCellCoords = (): ActiveTableCellCoords | null =>
    activeTableCell;
