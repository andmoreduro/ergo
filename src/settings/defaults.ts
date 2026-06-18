import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import { normalizeKeymapSettings } from "./keymapProfiles";
import type { ProjectSettings } from "../bindings/ProjectSettings";

export type ThemeMode = "system" | "light" | "dark";

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
    default_font: null,
    default_font_size: null,
    theme_mode: "system",
    locale: "en",
    recent_projects: [],
    keymap_profile: "Default",
    keymap_overrides: [],
    history_limit: 100,
    autosave_enabled: true,
    autosave_interval_ms: 30_000,
    autosave_on_window_blur: true,
    autosave_on_app_close: true,
    autosave_on_project_close: true,
    default_equation_syntax: "typst",
    zotero_translation_server_enabled: false,
    preview_draft_render_factor: 1.0,
    preview_render_overscan_factor: 0.0,
    preview_rasterization_debounce_ms: 200,
    preview_reveal_debounce_ms: 0,
    preview_forward_sync_debounce_ms: 0,
    preview_draft_promote_ms: 180,
};

/**
 * Read a setting that must be present, throwing if it is null/undefined. Default
 * values belong only in DEFAULT_GLOBAL_SETTINGS — call sites should not re-specify
 * them with `?? fallback`, which silently masks a missing-default bug.
 */
export const requireSetting = <T>(value: T | null | undefined, name: string): T => {
    if (value == null) {
        throw new Error(`Missing required setting: ${name}`);
    }
    return value;
};

export const DEFAULT_KEYMAP_SETTINGS: KeymapSettings = normalizeKeymapSettings({
    keymap_profile: "Default",
    keymap_bindings: [],
    keymap_overrides: [],
    active_profile_id: "default",
    profiles: [],
});

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
    paper_size: "us-letter",
    language: "en",
    text_font: "Libertinus Serif",
    math_font: "Libertinus Math",
    raw_font: "DejaVu Sans Mono",
    font_size: 11,
    table_stroke_width: 0.5,
    template_overrides: [],
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

export const mergeGlobalSettings = (
    settings: Partial<GlobalSettings> | null | undefined,
): GlobalSettings => {
    // Drop null/undefined fields before spreading so a persisted file that omits
    // a setting (older configs deserialize those Option fields to `null`) falls
    // back to its default instead of clobbering it — otherwise a non-null default
    // like preview_render_overscan_factor: 0 would be overwritten by null and
    // then trip requireSetting at the call site.
    const defined = Object.fromEntries(
        Object.entries(settings ?? {}).filter(
            ([, value]) => value !== null && value !== undefined,
        ),
    ) as Partial<GlobalSettings>;
    return {
        ...DEFAULT_GLOBAL_SETTINGS,
        ...defined,
        recent_projects: settings?.recent_projects ?? [],
        keymap_overrides: settings?.keymap_overrides ?? [],
    };
};

export const mergeKeymapSettings = (
    settings: Partial<KeymapSettings> | null | undefined,
): KeymapSettings =>
    normalizeKeymapSettings({
        ...DEFAULT_KEYMAP_SETTINGS,
        ...(settings ?? {}),
        keymap_bindings: settings?.keymap_bindings ?? [],
        keymap_overrides: settings?.keymap_overrides ?? [],
        active_profile_id:
            settings?.active_profile_id ?? DEFAULT_KEYMAP_SETTINGS.active_profile_id,
        profiles: settings?.profiles ?? [],
    });
