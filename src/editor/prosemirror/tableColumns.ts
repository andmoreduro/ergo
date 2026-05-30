/**
 * Stable pixel widths for prosemirror-tables `colwidth` attrs. Without these,
 * columnResizing measures content and columns jump when the selection moves.
 */

/** Nominal total width; with `width: 100%` on the table, columns scale to the editor. */
const TABLE_LAYOUT_WIDTH_PX = 10_000;
const MIN_COL_PX = 48;

const frWeight = (size: string): number => {
    const trimmed = size.trim();
    if (trimmed === "auto" || trimmed === "") {
        return 1;
    }
    if (trimmed.endsWith("fr")) {
        const value = Number.parseFloat(trimmed);
        return Number.isFinite(value) && value > 0 ? value : 1;
    }
    return 1;
};

/** Pixel width per column from Érgo `column_sizes` (e.g. `1fr`, `2fr`). */
export const columnPixelWidths = (
    columnCount: number,
    columnSizes: readonly string[],
): number[] => {
    if (columnCount <= 0) {
        return [];
    }
    const weights = Array.from({ length: columnCount }, (_, index) =>
        frWeight(columnSizes[index] ?? "1fr"),
    );
    const totalFr = weights.reduce((sum, weight) => sum + weight, 0) || columnCount;
    return weights.map((weight) =>
        Math.max(MIN_COL_PX, Math.round((weight / totalFr) * TABLE_LAYOUT_WIDTH_PX)),
    );
};

/** `colwidth` value for a cell from the table's column width list. */
export const cellColwidth = (
    colIndex: number,
    colspan: number,
    columnWidths: readonly number[],
): number[] | null => {
    if (columnWidths.length === 0) {
        return null;
    }
    const span = Math.max(1, colspan);
    const slice: number[] = [];
    for (let offset = 0; offset < span; offset += 1) {
        const width = columnWidths[colIndex + offset];
        if (width !== undefined) {
            slice.push(width);
        }
    }
    return slice.length > 0 ? slice : null;
};
