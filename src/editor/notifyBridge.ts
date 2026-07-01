/**
 * Bridge for triggering toast notifications from non-React modules.
 *
 * The toast UI lives in Workspace.tsx. Modules without React context access
 * (e.g. projectFontNotifications.ts, called from lifecycle hooks) use this
 * bridge instead of the legacy `window.dispatchEvent(new CustomEvent(...))`
 * pattern. The Workspace registers a handler on mount; callers invoke
 * `showToast(message)`.
 *
 * For React-context code (hooks/components), prefer dispatching
 * `workspace::Notify` through the action runtime instead of calling this
 * bridge directly.
 */

type ToastHandler = (message: string, variant?: "default" | "error") => void;

let handler: ToastHandler | null = null;

export function registerToastHandler(next: ToastHandler | null): void {
    handler = next;
}

export function showToast(message: string, variant?: "default" | "error"): void {
    handler?.(message, variant);
}
