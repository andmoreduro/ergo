import { NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export const isSettingsChromeTarget = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    Boolean(target.closest("[data-element-settings-chrome]"));

/** Move the caret out of a whole-block NodeSelection (removes the locked outline). */
export const clearWholeBlockSelection = (
    view: EditorView,
    blockPos: number,
): void => {
    const { selection } = view.state;
    if (!(selection instanceof NodeSelection) || selection.from !== blockPos) {
        return;
    }
    const node = view.state.doc.nodeAt(blockPos);
    if (!node) {
        return;
    }
    const after = blockPos + node.nodeSize;
    let tr = view.state.tr;
    if (after < view.state.doc.content.size) {
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after), 1));
    } else if (blockPos > 0) {
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(blockPos), -1));
    } else {
        return;
    }
    view.dispatch(tr);
};

/** Swallow pointer-down on the settings cog so the block is not selected or highlighted. */
export const absorbSettingsChromePointerDown = (
    _view: EditorView,
    event: MouseEvent,
): boolean => {
    if (!isSettingsChromeTarget(event.target)) {
        return false;
    }
    event.stopPropagation();
    return true;
};
