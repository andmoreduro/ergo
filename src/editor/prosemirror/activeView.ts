import { toggleMark } from "prosemirror-commands";
import type { EditorView } from "prosemirror-view";
import { bodySchema } from "./schema";

/**
 * The body editor that currently holds focus. Mark/formatting actions dispatched
 * through the action runtime (editor::Bold/Italic/Underline) operate on this
 * view's selection — the only place a multi-character range lives.
 */
let activeView: EditorView | null = null;

/** AST undo/redo for the focused body editor (not ProseMirror's history). */
export interface BodyHistoryActions {
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
}

let bodyHistory: BodyHistoryActions | null = null;

export const setBodyHistoryActions = (actions: BodyHistoryActions | null) => {
    bodyHistory = actions;
};

export const getBodyHistoryActions = (): BodyHistoryActions | null => bodyHistory;

/** AST paragraph insert from the focused body editor (table block shortcuts). */
export interface BodyParagraphInsert {
    insertBeforeElement: (beforeElementId: string) => void;
}

let bodyParagraphInsert: BodyParagraphInsert | null = null;

export const setBodyParagraphInsert = (actions: BodyParagraphInsert | null) => {
    bodyParagraphInsert = actions;
};

export const getBodyParagraphInsert = (): BodyParagraphInsert | null =>
    bodyParagraphInsert;

export const getActiveBodyView = (): EditorView | null => activeView;

export const setActiveBodyView = (view: EditorView | null) => {
    activeView = view;
};

export const clearActiveBodyView = (view: EditorView) => {
    if (activeView === view) {
        activeView = null;
    }
};

const MARK_BY_NAME = {
    bold: bodySchema.marks.strong,
    italic: bodySchema.marks.em,
    underline: bodySchema.marks.underline,
} as const;

/** Toggle a mark on the focused body editor. Returns false when none is focused. */
export const applyBodyMark = (
    mark: "bold" | "italic" | "underline",
): boolean => {
    const view = activeView;
    if (!view) {
        return false;
    }
    if (!view.hasFocus()) {
        view.focus();
    }
    toggleMark(MARK_BY_NAME[mark])(view.state, view.dispatch);
    return true;
};
