import type { EditorView } from "prosemirror-view";
import { isActiveTableCellEditing } from "./prosemirror/table/tableCellInsertPolicy";
import { focusTargetFromState } from "./prosemirror/selection";

/**
 * When inserting from the document body, anchor after the block under the
 * ProseMirror selection. Toolbar clicks move DOM focus off the editor, but the
 * PM selection (and document focus store) still identify the block — do not
 * require `document.activeElement` to be inside the body surface.
 */
export const resolveBodyInsertAnchor = (
    bodyView: EditorView | null,
): { afterElementId: string } | null => {
    if (!bodyView || isActiveTableCellEditing()) {
        return null;
    }

    const target = focusTargetFromState(bodyView.state);
    if (!target?.elementId) {
        return null;
    }

    return { afterElementId: target.elementId };
};
