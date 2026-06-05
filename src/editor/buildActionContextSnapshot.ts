import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import {
    getActiveBodyView,
    getActiveTableCellEditor,
} from "./prosemirror/activeView";
import { getEditingBlockElementId } from "./prosemirror/blockUiState";
import { isActiveTableCellEditing } from "./prosemirror/table/tableCellInsertPolicy";

const ACTIVE_TABLE_CELL_CONTEXT_ID = "active-table-cell";
const ACTIVE_INLINE_ELEMENT_CONTEXT_ID = "active-inline-element";
const ACTIVE_ELEMENT_EDITING_CONTEXT_ID = "active-element-editing";

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

const inlineElementKind = (target: EventTarget | null): string | null => {
    if (!(target instanceof Node)) {
        return null;
    }

    const element =
        target instanceof HTMLElement ? target : target.parentElement;
    if (!element) {
        return null;
    }

    if (element.closest("[data-inline-quote-host]")) {
        return "InlineQuote";
    }

    if (element.closest("[data-inline-equation-host]")) {
        return "InlineEquation";
    }

    return null;
};

const withEphemeralContext = (
    base: ActionContextSnapshot,
    node: {
        id: string;
        contexts: string[];
        attributes: Record<string, string>;
    },
): ActionContextSnapshot => {
    const parentId = base.focused_context_id ?? "app";
    return {
        ...base,
        focused_context_id: node.id,
        nodes: [
            ...base.nodes,
            {
                id: node.id,
                parent_id: parentId,
                contexts: node.contexts,
                attributes: node.attributes,
            },
        ],
    };
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
        return withEphemeralContext(base, {
            id: ACTIVE_TABLE_CELL_CONTEXT_ID,
            contexts: ["tableCell"],
            attributes: {},
        });
    }

    const inlineKind = inlineElementKind(target);
    if (inlineKind) {
        const base = getSnapshot({ includeInputContext: false });
        return withEphemeralContext(base, {
            id: ACTIVE_INLINE_ELEMENT_CONTEXT_ID,
            contexts: ["inlineElement"],
            attributes: {
                "element.kind": inlineKind,
            },
        });
    }

    const editingElementId = getEditingBlockElementId();
    if (editingElementId) {
        const base = getSnapshot({ includeInputContext: false });
        return withEphemeralContext(base, {
            id: ACTIVE_ELEMENT_EDITING_CONTEXT_ID,
            contexts: ["element"],
            attributes: {
                "element.id": editingElementId,
            },
        });
    }

    if (inBodyPm) {
        return getSnapshot({ includeInputContext: false });
    }

    return getSnapshot({ includeInputContext: editable });
};

export const ACTIVE_TABLE_CELL_ACTION_CONTEXT_ID = ACTIVE_TABLE_CELL_CONTEXT_ID;
