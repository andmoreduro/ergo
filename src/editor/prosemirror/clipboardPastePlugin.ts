import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
    canClipboardPasteHandle,
    runClipboardPaste,
} from "../clipboard/runClipboardPaste";
import type { ClipboardPasteContext } from "../clipboard/types";
import { focusTargetFromState } from "./selection";
import {
    getActiveBodyView,
    getActiveTableCellEditor,
    getBodyClipboardPasteDeps,
} from "./activeView";

const shouldHandlePaste = (view: EditorView): boolean => {
    if (getActiveTableCellEditor()?.hasFocus()) {
        return false;
    }
    const body = getActiveBodyView();
    return body === view || view.hasFocus();
};

export const clipboardPastePlugin = () =>
    new Plugin({
        props: {
            handlePaste(view, event) {
                if (!shouldHandlePaste(view)) {
                    return false;
                }

                const deps = getBodyClipboardPasteDeps();
                if (!deps) {
                    return false;
                }

                const data = event.clipboardData;
                if (!data || !canClipboardPasteHandle(data)) {
                    return false;
                }

                const focus = focusTargetFromState(view.state);
                const ctx: ClipboardPasteContext = {
                    ast: deps.getAst(),
                    anchorElementId: focus?.elementId ?? null,
                    templateSpec: deps.getTemplateSpec(),
                    dispatch: deps.dispatch,
                    setDocumentFocus: deps.setDocumentFocus,
                };

                event.preventDefault();
                void runClipboardPaste(ctx, data).catch((error) => {
                    console.error("Clipboard paste failed", error);
                });
                return true;
            },
        },
    });
