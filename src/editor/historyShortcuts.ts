/** Ctrl/Cmd+Z undo chord — matches catalog `edit::Undo` default binding. */
export const isHistoryUndoShortcut = (
    event: Pick<
        KeyboardEvent,
        "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
    >,
    markKey: string,
): boolean =>
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    markKey === "z";

/** Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo chords — catalog `edit::Redo` bindings. */
export const isHistoryRedoShortcut = (
    event: Pick<
        KeyboardEvent,
        "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
    >,
    markKey: string,
): boolean =>
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    (markKey === "y" || (markKey === "z" && event.shiftKey));
