import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { EquationSyntax } from "../bindings/EquationSyntax";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { WorkspaceColumnWidths } from "../bindings/WorkspaceColumnWidths";
import type { KeymapProfile } from "../commands/types";
import type { Locale } from "../paraglide/runtime.js";
import { DEFAULT_GLOBAL_SETTINGS, type ThemeMode } from "./global/defaults";
import { useSettingsStore } from "./settingsStore";

/**
 * Single access point for application configuration.
 *
 * - `useGlobalSettings()` — the user's global preferences, always merged with
 *   the shipped defaults (no `?? fallback` needed at call sites).
 * - `useKeymap()` — keymap settings plus the resolved profile and conflicts.
 * - `useSettingsActions()` — identity-stable mutators; safe to use in effects
 *   and memoized handlers without re-rendering on every settings change.
 * - `usePreviewSettings()` / `useDefaultEquationSyntax()` — typed views on the
 *   slices the preview and editor consume.
 *
 * Project settings live in the document (`metadata.project_settings`) and are
 * read through the document selectors; template defaults come from
 * `settings/project`.
 */

interface GlobalSettingsContextValue {
    settings: GlobalSettings;
    themeMode: ThemeMode;
    locale: Locale;
    /** False until the persisted settings have been read (or found absent). */
    ready: boolean;
}

export interface KeymapContextValue {
    settings: KeymapSettings;
    keymap: KeymapProfile;
    conflicts: unknown[];
}

export interface SettingsActions {
    updateGlobalSettings: (settings: GlobalSettings) => void;
    updateKeymapSettings: (settings: KeymapSettings) => void;
    setThemeMode: (mode: ThemeMode) => void;
    setLocale: (locale: Locale) => void;
    rememberProject: (path: string) => void;
    forgetProject: (path: string) => void;
    setWorkspaceColumns: (columns: WorkspaceColumnWidths) => void;
}

/** Preview tuning knobs resolved to concrete values. */
export interface PreviewSettings {
    draftRenderFactor: number;
    renderOverscanFactor: number;
    rasterizationDebounceMs: number;
    revealDebounceMs: number;
    forwardSyncDebounceMs: number;
    draftPromoteMs: number;
    multiCaret: boolean;
}

const GlobalSettingsContext = createContext<GlobalSettingsContextValue | undefined>(
    undefined,
);
const KeymapContext = createContext<KeymapContextValue | undefined>(undefined);
const SettingsActionsContext = createContext<SettingsActions | undefined>(undefined);

export const resolvePreviewSettings = (settings: GlobalSettings): PreviewSettings => ({
    draftRenderFactor:
        settings.preview_draft_render_factor ??
        DEFAULT_GLOBAL_SETTINGS.preview_draft_render_factor!,
    renderOverscanFactor:
        settings.preview_render_overscan_factor ??
        DEFAULT_GLOBAL_SETTINGS.preview_render_overscan_factor!,
    rasterizationDebounceMs:
        settings.preview_rasterization_debounce_ms ??
        DEFAULT_GLOBAL_SETTINGS.preview_rasterization_debounce_ms!,
    revealDebounceMs:
        settings.preview_reveal_debounce_ms ??
        DEFAULT_GLOBAL_SETTINGS.preview_reveal_debounce_ms!,
    forwardSyncDebounceMs:
        settings.preview_forward_sync_debounce_ms ??
        DEFAULT_GLOBAL_SETTINGS.preview_forward_sync_debounce_ms!,
    draftPromoteMs:
        settings.preview_draft_promote_ms ??
        DEFAULT_GLOBAL_SETTINGS.preview_draft_promote_ms!,
    multiCaret:
        settings.preview_multi_caret ?? DEFAULT_GLOBAL_SETTINGS.preview_multi_caret!,
});

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
    const store = useSettingsStore();

    const globalValue = useMemo<GlobalSettingsContextValue>(
        () => ({
            settings: store.globalSettings,
            themeMode: store.themeMode,
            locale: store.locale,
            ready: store.settingsLoaded,
        }),
        [store.globalSettings, store.themeMode, store.locale, store.settingsLoaded],
    );

    const keymapValue = useMemo<KeymapContextValue>(
        () => ({
            settings: store.keymapSettings,
            keymap: store.keymap,
            conflicts: store.keymapConflicts,
        }),
        [store.keymapSettings, store.keymap, store.keymapConflicts],
    );

    const actions = useMemo<SettingsActions>(
        () => ({
            updateGlobalSettings: store.updateGlobalSettings,
            updateKeymapSettings: store.updateKeymapSettings,
            setThemeMode: store.setThemeMode,
            setLocale: store.setLocale,
            rememberProject: store.rememberProject,
            forgetProject: store.forgetProject,
            setWorkspaceColumns: store.setWorkspaceColumns,
        }),
        [
            store.updateGlobalSettings,
            store.updateKeymapSettings,
            store.setThemeMode,
            store.setLocale,
            store.rememberProject,
            store.forgetProject,
            store.setWorkspaceColumns,
        ],
    );

    return (
        <SettingsActionsContext.Provider value={actions}>
            <KeymapContext.Provider value={keymapValue}>
                <GlobalSettingsContext.Provider value={globalValue}>
                    {children}
                </GlobalSettingsContext.Provider>
            </KeymapContext.Provider>
        </SettingsActionsContext.Provider>
    );
};

const useGlobalSettingsContext = (): GlobalSettingsContextValue => {
    const value = useContext(GlobalSettingsContext);
    if (value === undefined) {
        throw new Error("useGlobalSettings must be used within a SettingsProvider");
    }
    return value;
};

export const useGlobalSettings = (): GlobalSettings =>
    useGlobalSettingsContext().settings;

export const useThemeMode = (): ThemeMode => useGlobalSettingsContext().themeMode;

export const useUiLocale = (): Locale => useGlobalSettingsContext().locale;

/** Whether persisted settings have loaded; gates the shell so it never renders half-configured. */
export const useSettingsReady = (): boolean => useGlobalSettingsContext().ready;

export const useKeymap = (): KeymapContextValue => {
    const value = useContext(KeymapContext);
    if (value === undefined) {
        throw new Error("useKeymap must be used within a SettingsProvider");
    }
    return value;
};

export const useSettingsActions = (): SettingsActions => {
    const value = useContext(SettingsActionsContext);
    if (value === undefined) {
        throw new Error("useSettingsActions must be used within a SettingsProvider");
    }
    return value;
};

export const usePreviewSettings = (): PreviewSettings => {
    const settings = useGlobalSettings();
    return useMemo(() => resolvePreviewSettings(settings), [settings]);
};

export const useDefaultEquationSyntax = (): EquationSyntax =>
    useGlobalSettings().default_equation_syntax ??
    DEFAULT_GLOBAL_SETTINGS.default_equation_syntax!;
