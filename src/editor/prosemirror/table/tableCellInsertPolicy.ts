import type { ActionId } from "../../../bindings/ActionId";
import type { ElementType } from "../../../commands/editorCommands";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { tableCellFieldId } from "../../fieldIds";
import {
    getTableCellEditContext,
    type TableCellEditContext,
} from "./tableCellInsert";
import {
    getActiveTableCellCoords,
    isActiveTableCellEditing,
} from "./tableStructureBridge";

export { isActiveTableCellEditing } from "./tableStructureBridge";

/** Block inserts that cannot live inside a table cell. */
export const TABLE_CELL_FORBIDDEN_INSERTS: ReadonlySet<ElementType> = new Set([
    "heading",
    "table",
    "figure",
    "diagram",
]);

/** Keymap actions swallowed in `tableCell` context (toolbar-locked inserts). */
export const TABLE_CELL_FORBIDDEN_ACTION_IDS: readonly ActionId[] = [
    "editor::InsertHeading",
    "editor::InsertTable",
    "editor::InsertFigure",
    "editor::InsertDiagram",
];

export const isTableCellForbiddenInsert = (elementType: ElementType): boolean =>
    TABLE_CELL_FORBIDDEN_INSERTS.has(elementType);

/**
 * Resolve table-cell edit context from the live nested editor session when
 * possible, so toolbar/insert logic stays stable while `documentFocus` catches up.
 */
export const resolveTableCellEditContext = (
    ast: DocumentAST,
    elementId: string | null,
    fieldId: string | null,
): TableCellEditContext | null => {
    if (isActiveTableCellEditing()) {
        const coords = getActiveTableCellCoords();
        if (coords) {
            const fromSession = getTableCellEditContext(
                ast,
                coords.tableId,
                tableCellFieldId(coords.tableId, coords.row, coords.col),
            );
            if (fromSession) {
                return fromSession;
            }
        }
    }
    return getTableCellEditContext(ast, elementId, fieldId);
};
