import type { GlobalSettings } from "../../bindings/GlobalSettings";

export type ThemeMode = "system" | "light" | "dark";

/**
 * Pre-IPC boot fallback for global settings. The shipped file
 * `src-tauri/defaults/default_settings.json` is the single source of truth
 * (Rust embeds it for `GlobalSettings::default()`); `defaults.test.ts` guards
 * that this copy matches it field for field.
 */
export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
    default_font: null,
    default_font_size: null,
    theme_mode: "system",
    locale: "en",
    recent_projects: [],
    history_limit: 100,
    autosave_enabled: true,
    autosave_interval_ms: 30_000,
    autosave_on_window_blur: true,
    autosave_on_app_close: true,
    autosave_on_project_close: true,
    default_equation_syntax: "typst",
    zotero_translation_server_enabled: false,
    zotero_translation_server_url: null,
    preview_draft_render_factor: 1.0,
    preview_render_overscan_factor: 0.0,
    preview_rasterization_debounce_ms: 200,
    preview_reveal_debounce_ms: 0,
    preview_forward_sync_debounce_ms: 0,
    preview_draft_promote_ms: 180,
    preview_multi_caret: true,
    workspace_columns: null,
};

export const normalizeThemeMode = (value: string | null): ThemeMode => {
    if (value === "light" || value === "dark") {
        return value;
    }

    return "system";
};

/** Merges persisted and in-session recent lists (primary order wins). */
export const mergeRecentProjectLists = (
    primary: string[],
    secondary: string[],
    limit = 8,
): string[] => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const path of [...primary, ...secondary]) {
        if (seen.has(path)) {
            continue;
        }
        seen.add(path);
        merged.push(path);
        if (merged.length >= limit) {
            break;
        }
    }
    return merged;
};

/**
 * Fills a (possibly partial) settings object with the defaults. Null and
 * undefined fields fall back, so a file written by an older version that omits
 * a setting never clobbers a non-null default. Consumers can therefore read
 * defaulted fields without re-specifying the fallback at the call site.
 */
export const mergeGlobalSettings = (
    settings: Partial<GlobalSettings> | null | undefined,
): GlobalSettings => {
    const defined = Object.fromEntries(
        Object.entries(settings ?? {}).filter(
            ([, value]) => value !== null && value !== undefined,
        ),
    ) as Partial<GlobalSettings>;
    return {
        ...DEFAULT_GLOBAL_SETTINGS,
        ...defined,
        recent_projects: settings?.recent_projects ?? [],
    };
};
