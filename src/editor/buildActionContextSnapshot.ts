import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import {
    getActiveBodyView,
    getActiveTableCellEditor,
} from "./prosemirror/activeView";
import { isActiveTableCellEditing } from "./prosemirror/table/tableCellInsertPolicy";

const ACTIVE_TABLE_CELL_CONTEXT_ID = "active-table-cell";

const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    return Boolean(
        target.closest(
            "input, textarea, select, [contenteditable='true'], [contenteditable='']",
        ),
    );
};

const targetNode = (target: EventTarget | null): Node | null =>
    target instanceof Node ? target : null;

const BODY_EDITOR_SELECTOR = "[data-ergo-body-editor]";

const isInProseMirrorSurface = (
    view: { dom: HTMLElement } | null,
    node: Node | null,
): boolean => {
    if (view !== null && node !== null && view.dom.contains(node)) {
        return true;
    }

    if (!(node instanceof Node)) {
        return false;
    }

    const element =
        node instanceof HTMLElement ? node : node.parentElement;
    return Boolean(element?.closest(BODY_EDITOR_SELECTOR));
};

/**
 * ProseMirror body and nested table-cell editors are contenteditable, but they
 * use the `body` / `tableCell` action contexts — not the generic `input` context
 * reserved for template fields and sidebar forms.
 */
export const buildActionContextSnapshot = (
    target: EventTarget | null,
    getSnapshot: (options?: { includeInputContext?: boolean }) => ActionContextSnapshot,
): ActionContextSnapshot => {
    const editable = isEditableTarget(target);
    const node = targetNode(target);
    const tableCellView = getActiveTableCellEditor();
    const bodyView = getActiveBodyView();
    const inTableCell =
        isActiveTableCellEditing() &&
        isInProseMirrorSurface(tableCellView, node);
    const inBodyPm =
        !inTableCell && isInProseMirrorSurface(bodyView, node);

    if (inTableCell) {
        const base = getSnapshot({ includeInputContext: false });
        const parentId = base.focused_context_id ?? "app";
        return {
            ...base,
            focused_context_id: ACTIVE_TABLE_CELL_CONTEXT_ID,
            nodes: [
                ...base.nodes,
                {
                    id: ACTIVE_TABLE_CELL_CONTEXT_ID,
                    parent_id: parentId,
                    contexts: ["tableCell"],
                    attributes: {},
                },
            ],
        };
    }

    if (inBodyPm) {
        return getSnapshot({ includeInputContext: false });
    }

    return getSnapshot({ includeInputContext: editable });
};

export const ACTIVE_TABLE_CELL_ACTION_CONTEXT_ID = ACTIVE_TABLE_CELL_CONTEXT_ID;
