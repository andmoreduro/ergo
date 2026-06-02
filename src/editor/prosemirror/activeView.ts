import { toggleMark } from "prosemirror-commands";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import type { DocumentEvent } from "../../bindings/DocumentEvent";
import type { ASTAction } from "../../state/ast/actions";
import { isBlockEditing } from "./blockEditMode";
import { bodySchema } from "./schema";
import { tableSchema } from "./table/tableSchema";
import { getActiveTableCellCoords } from "./table/tableStructureBridge";

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

let clearPmReconcileSkip: (() => void) | null = null;

export const setBodyReconcileGuard = (clear: (() => void) | null): void => {
    clearPmReconcileSkip = clear;
};

/** Clears the body editor deferral after undo/redo so AST changes can reconcile into PM. */
export const clearBodyReconcileSkip = (): void => {
    clearPmReconcileSkip?.();
};

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

let bodyAstDispatch: ((action: ASTAction) => void) | null = null;

export const setBodyAstDispatch = (dispatch: ((action: ASTAction) => void) | null) => {
    bodyAstDispatch = dispatch;
};

export const getBodyAstDispatch = (): ((action: ASTAction) => void) | null =>
    bodyAstDispatch;

let activeTableCellEditor: EditorView | null = null;

export const setActiveTableCellEditor = (view: EditorView | null) => {
    activeTableCellEditor = view;
};

export const getActiveTableCellEditor = (): EditorView | null =>
    activeTableCellEditor;

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

/**
 * Text editor that should receive formatting commands. While a table cell is
 * being edited, keep routing to the nested child view even after toolbar focus
 * moves away (hasFocus() would otherwise fall back to the outer body view).
 */
const focusedTextView = (): EditorView | null => {
    const coords = getActiveTableCellCoords();
    if (
        activeTableCellEditor &&
        coords &&
        activeView &&
        isBlockEditing(activeView.state, coords.tableId)
    ) {
        return activeTableCellEditor;
    }
    return activeView;
};

export const applyBodyMark = (
    mark: "bold" | "italic" | "underline",
): boolean => {
    const view = focusedTextView();
    if (!view) {
        return false;
    }
    const markName =
        mark === "bold" ? "strong" : mark === "italic" ? "em" : "underline";
    const markType =
        view.state.schema === tableSchema
            ? tableSchema.marks[markName]
            : MARK_BY_NAME[mark];
    if (!markType) {
        return false;
    }

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

    toggleMark(markType)(view.state, view.dispatch);
    return true;
};
