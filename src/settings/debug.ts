/**
 * Debug-only UI (e.g. context menu "Inspect") is shown when this returns true.
 *
 * - Vite dev (`pnpm tauri dev`): always enabled
 * - Release builds: set `localStorage.setItem("ergo:debug", "1")` to enable
 */
export function isDebugMenuEnabled(): boolean {
    if (import.meta.env.DEV) {
        return true;
    }

    if (typeof window === "undefined") {
        return false;
    }

    return window.localStorage.getItem("ergo:debug") === "1";
}
