import { Plugin } from "prosemirror-state";
import { NodeSelection } from "prosemirror-state";
import { CellSelection, isInTable } from "prosemirror-tables";
import { TABLE_BLOCK_NODE } from "./schema";
import { isBlockEditing } from "./blockEditMode";

/**
 * `prosemirror-tables` may pull a nearby selection into a cell. While the table
 * is locked, keep whole-table focus on the `table_block` wrapper instead.
 */
export const tableSelectionGuardPlugin = () =>
    new Plugin({
        appendTransaction(_transactions, _oldState, newState) {
            const { selection } = newState;
            if (
                selection instanceof NodeSelection &&
                selection.node.type.name === TABLE_BLOCK_NODE
            ) {
                const elementId = selection.node.attrs.elementId as string;
                if (!isBlockEditing(newState, elementId)) {
                    return null;
                }
            }

            if (!isInTable(newState) && !(selection instanceof CellSelection)) {
                return null;
            }

            const $head = selection.$head;
            for (let depth = $head.depth; depth > 0; depth -= 1) {
                if ($head.node(depth).type.name !== TABLE_BLOCK_NODE) {
                    continue;
                }
                const elementId = $head.node(depth).attrs.elementId as string;
                if (isBlockEditing(newState, elementId)) {
                    return null;
                }
                return newState.tr.setSelection(
                    NodeSelection.create(newState.doc, $head.before(depth)),
                );
            }

            return null;
        },
    });
