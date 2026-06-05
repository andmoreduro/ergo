import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { getActiveBodyView, getActiveTableCellEditor } from "./activeView";
import { publishActiveTextMarks } from "./textMarkState";

const isInlineChipEditing = (): boolean => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
        return false;
    }
    return Boolean(
        active.closest("[data-inline-quote-host], [data-inline-equation-host]"),
    );
};

const syncActiveTextMarksFromFocusedSurface = (): void => {
    if (isInlineChipEditing()) {
        publishActiveTextMarks(null);
        return;
    }
    const cellEditor = getActiveTableCellEditor();
    if (cellEditor?.hasFocus()) {
        publishActiveTextMarks(cellEditor.state);
        return;
    }
    const bodyView = getActiveBodyView();
    if (bodyView?.hasFocus()) {
        publishActiveTextMarks(bodyView.state);
        return;
    }
    publishActiveTextMarks(null);
};

/**
 * Publishes bold/italic/underline active state for the toolbar whenever a body
 * or table-cell editor selection changes or gains/loses focus.
 */
export const textMarkStatePlugin = () =>
    new Plugin({
        view(editorView: EditorView) {
            const onFocusChange = () => syncActiveTextMarksFromFocusedSurface();

            editorView.dom.addEventListener("focusin", onFocusChange);
            editorView.dom.addEventListener("focusout", onFocusChange);
            syncActiveTextMarksFromFocusedSurface();

            return {
                update(view, prevState) {
                    if (
                        view.state.doc === prevState.doc &&
                        view.state.selection === prevState.selection &&
                        view.state.storedMarks === prevState.storedMarks
                    ) {
                        return;
                    }
                    syncActiveTextMarksFromFocusedSurface();
                },
                destroy() {
                    editorView.dom.removeEventListener("focusin", onFocusChange);
                    editorView.dom.removeEventListener("focusout", onFocusChange);
                    syncActiveTextMarksFromFocusedSurface();
                },
            };
        },
    });
