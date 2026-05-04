import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
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
    preview_debounce_ms: 300,
    history_limit: 100,
};

export const DEFAULT_KEYMAP_SETTINGS: KeymapSettings = {
    keymap_profile: "Default",
    keymap_bindings: [],
    keymap_overrides: [],
};

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

export const mergeGlobalSettings = (
    settings: Partial<GlobalSettings> | null | undefined,
): GlobalSettings => ({
    ...DEFAULT_GLOBAL_SETTINGS,
    ...(settings ?? {}),
    recent_projects: settings?.recent_projects ?? [],
    keymap_overrides: settings?.keymap_overrides ?? [],
});

export const mergeKeymapSettings = (
    settings: Partial<KeymapSettings> | null | undefined,
): KeymapSettings => ({
    ...DEFAULT_KEYMAP_SETTINGS,
    ...(settings ?? {}),
    keymap_bindings: settings?.keymap_bindings ?? [],
    keymap_overrides: settings?.keymap_overrides ?? [],
});
