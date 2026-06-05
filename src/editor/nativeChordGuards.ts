import { normalizeShortcutKey } from "./shortcutKeyFromKeyboardEvent";

/**
 * Predicates for chords whose **browser / WebView-native behavior** must be
 * suppressed (`preventDefault`) before the keymap resolver runs. The WebView
 * would otherwise open its own find bar on Ctrl+F, zoom on Ctrl+=, or toggle
 * native `contenteditable` bold/italic/underline on Ctrl+B/I/U.
 *
 * These are deliberately tied to the physical chord the browser reserves, NOT to
 * the user's app keymap — keymap resolution is owned by Rust and runs
 * asynchronously, too late to stop a synchronous native default. Keeping them in
 * one named, testable place stops the runtime keydown handler from drowning in
 * inline boolean expressions and makes the "native suppression vs. keymap"
 * boundary explicit.
 *
 * Each predicate takes the already-normalized `markKey`
 * (`normalizeShortcutKey(event.key)`) to avoid recomputing it on the keystroke
 * hot path.
 */

const hasPrimaryModifier = (event: KeyboardEvent): boolean =>
    event.ctrlKey || event.metaKey;

const ARROW_KEYS = new Set([
    "arrowleft",
    "arrowright",
    "arrowup",
    "arrowdown",
]);

/** Ctrl/Cmd+F — WebView find bar. */
export const isFindShortcut = (event: KeyboardEvent, markKey: string): boolean =>
    hasPrimaryModifier(event) &&
    !event.altKey &&
    !event.shiftKey &&
    markKey === "f";

/** F3 / Shift+F3 — WebView find-again navigation. */
export const isFindNavShortcut = (
    event: KeyboardEvent,
    markKey: string,
): boolean =>
    markKey === "f3" && !event.ctrlKey && !event.metaKey && !event.altKey;

/** Ctrl/Cmd+, — would otherwise be swallowed as a plain character. */
export const isElementSettingsShortcut = (
    event: KeyboardEvent,
    markKey: string,
): boolean =>
    hasPrimaryModifier(event) &&
    !event.altKey &&
    !event.shiftKey &&
    markKey === ",";

/** Ctrl/Cmd+B/I/U — native contenteditable mark toggles. */
export const isMarkShortcut = (event: KeyboardEvent, markKey: string): boolean =>
    hasPrimaryModifier(event) &&
    !event.altKey &&
    !event.shiftKey &&
    (markKey === "b" || markKey === "i" || markKey === "u");

/** Ctrl/Cmd +/-/= (incl. numpad) — WebView page zoom. */
export const isZoomShortcut = (event: KeyboardEvent, markKey: string): boolean =>
    hasPrimaryModifier(event) &&
    !event.altKey &&
    (markKey === "=" ||
        markKey === "+" ||
        markKey === "-" ||
        event.code === "NumpadAdd" ||
        event.code === "NumpadSubtract");

/** Alt+Arrow — caret-word navigation the table grid owns while editing a cell. */
export const isTableCellNavShortcut = (
    event: KeyboardEvent,
    markKey: string,
): boolean =>
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    ARROW_KEYS.has(markKey);

/** Ctrl/Cmd+Shift+M — table cell merge. */
export const isTableMergeShortcut = (
    event: KeyboardEvent,
    markKey: string,
): boolean =>
    hasPrimaryModifier(event) &&
    event.shiftKey &&
    !event.altKey &&
    markKey === "m";

/** Ctrl/Cmd+Shift+S — table cell split. */
export const isTableSplitShortcut = (
    event: KeyboardEvent,
    markKey: string,
): boolean =>
    hasPrimaryModifier(event) &&
    event.shiftKey &&
    !event.altKey &&
    markKey === "s";

/** Convenience for callers that have only the raw event. */
export const markKeyFromEvent = (event: KeyboardEvent): string =>
    normalizeShortcutKey(event.key);
