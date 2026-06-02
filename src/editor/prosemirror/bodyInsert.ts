import type { EditorView } from "prosemirror-view";
import { getActiveBodyView, getActiveTableCellEditor } from "./activeView";
import { bodySchema } from "./schema";
import { tableSchema } from "./table/tableSchema";

const focusedTextView = (): EditorView | null => {
    const tableView = getActiveTableCellEditor();
    if (tableView?.hasFocus()) {
        return tableView;
    }
    return getActiveBodyView();
};

/** Insert a citation chip at the current text selection in the focused editor. */
export const insertBodyReference = (
    referenceId: string,
    label: string,
): boolean => {
    const view = focusedTextView();
    if (!view) {
        return false;
    }
    const schema =
        view.state.schema === tableSchema ? tableSchema : bodySchema;
    const ref = schema.nodes.reference.create({ referenceId, label });
    view.dispatch(view.state.tr.replaceSelectionWith(ref).scrollIntoView());
    view.focus();
    return true;
};

/** Insert an inline equation atom at the current text selection. */
export const insertBodyInlineEquation = (
    source = "",
    syntax: "typst" | "latex" = "typst",
): boolean => {
    const view = focusedTextView();
    if (!view) {
        return false;
    }
    const schema =
        view.state.schema === tableSchema ? tableSchema : bodySchema;
    const node = schema.nodes.inlineEquation.create({
        source,
        syntax,
        label: source,
    });
    view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
    view.focus();
    return true;
};
