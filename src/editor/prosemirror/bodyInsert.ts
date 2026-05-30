import type { EditorView } from "prosemirror-view";
import { getActiveBodyView } from "./activeView";
import { bodySchema } from "./schema";

const activeView = (): EditorView | null => getActiveBodyView();

/** Insert a citation chip at the current text selection in the focused body editor. */
export const insertBodyReference = (
    referenceId: string,
    label: string,
): boolean => {
    const view = activeView();
    if (!view) {
        return false;
    }
    const { state } = view;
    const ref = bodySchema.nodes.reference.create({ referenceId, label });
    view.dispatch(state.tr.replaceSelectionWith(ref).scrollIntoView());
    view.focus();
    return true;
};

/** Insert an inline equation atom at the current text selection. */
export const insertBodyInlineEquation = (source = ""): boolean => {
    const view = activeView();
    if (!view) {
        return false;
    }
    const { state } = view;
    const node = bodySchema.nodes.inlineEquation.create({
        source,
        syntax: "typst",
        label: source,
    });
    view.dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
    view.focus();
    return true;
};
