import type { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { getActiveBodyView, getActiveTableCellEditor } from "./activeView";
import { focusInlineEquationAfterInsert } from "./inlineEquationFocus";
import { focusInlineQuoteAfterInsert } from "./inlineQuoteFocus";
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
    focusInlineEquationAfterInsert(view);
    return true;
};

/** Insert an inline quotation atom at the current text selection. */
export const insertBodyInlineQuote = (source = ""): boolean => {
    const view = focusedTextView();
    if (!view) {
        return false;
    }
    const schema =
        view.state.schema === tableSchema ? tableSchema : bodySchema;
    const selectionBefore = view.state.selection;
    if (!view.hasFocus()) {
        view.focus();
    }
    if (
        view.state.selection.from !== selectionBefore.from ||
        view.state.selection.to !== selectionBefore.to
    ) {
        view.dispatch(
            view.state.tr.setSelection(
                TextSelection.create(
                    view.state.doc,
                    selectionBefore.from,
                    selectionBefore.to,
                ),
            ),
        );
    }
    const node = schema.nodes.inlineQuote.create({
        source,
        label: source,
    });
    view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
    focusInlineQuoteAfterInsert(view);
    return true;
};
