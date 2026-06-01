import { toggleMark } from "prosemirror-commands";
import type { EditorView } from "prosemirror-view";
import type { DocumentEvent } from "../../bindings/DocumentEvent";
import { bodySchema } from "./schema";

/**
 * The body editor that currently holds focus. Mark/formatting actions dispatched
 * through the action runtime (editor::Bold/Italic/Underline) operate on this
 * view's selection — the only place a multi-character range lives.
 */
let activeView: EditorView | null = null;

export interface BodyTabModifiers {
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}

const defaultBodyTabModifiers = (): BodyTabModifiers => ({
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
});

let pendingBodyTab: BodyTabModifiers = defaultBodyTabModifiers();

/** Modifier state for Tab currently being resolved by the action runtime. */
export const captureBodyTabKey = (
    event: Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "metaKey">,
): void => {
    pendingBodyTab = {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
    };
};

export const peekBodyTabModifiers = (): Readonly<BodyTabModifiers> =>
    pendingBodyTab;

export const peekBodyTabShiftKey = (): boolean => peekBodyTabModifiers().shiftKey;

export const consumeBodyTabShiftKey = (): boolean => {
    const shift = pendingBodyTab.shiftKey;
    pendingBodyTab = defaultBodyTabModifiers();
    return shift;
};

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
    insertAfterElement: (afterElementId: string) => void;
}

let bodyParagraphInsert: BodyParagraphInsert | null = null;

export interface BodyTableCommit {
    sectionId: string;
    commit: (forward: DocumentEvent[], inverse: DocumentEvent[]) => void;
    elementIndex: (tableId: string) => number;
}

let bodyTableCommit: BodyTableCommit | null = null;

export const setBodyTableCommit = (bridge: BodyTableCommit | null) => {
    bodyTableCommit = bridge;
};

export const getBodyTableCommit = (): BodyTableCommit | null => bodyTableCommit;

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
