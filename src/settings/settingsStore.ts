import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TauriApi } from "../api/tauri";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import type { WorkspaceColumnWidths } from "../bindings/WorkspaceColumnWidths";
import { showToast } from "../editor/notifyBridge";
import { m } from "../paraglide/messages.js";
import { getLocale, locales, setLocale } from "../paraglide/runtime.js";
import type { Locale } from "../paraglide/runtime.js";
import {
    DEFAULT_GLOBAL_SETTINGS,
    mergeGlobalSettings,
    mergeRecentProjectLists,
    normalizeThemeMode,
    type ThemeMode,
} from "./global/defaults";
import { DEFAULT_KEYMAP_SETTINGS, mergeKeymapSettings } from "./keymap/defaults";
import { createKeymapProfile } from "./keymap/profile";

const isLocale = (value: string | null): value is Locale =>
    locales.includes(value as Locale);

/**
 * Loads, persists and exposes the user's global and keymap settings. Internal
 * to `SettingsProvider`; components read settings through the hooks it exports.
 */
export const useSettingsStore = () => {
    const [locale, setActiveLocale] = useState<Locale>(getLocale());
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(
        DEFAULT_GLOBAL_SETTINGS,
    );
    const [keymapSettings, setKeymapSettings] = useState<KeymapSettings>(
        DEFAULT_KEYMAP_SETTINGS,
    );
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const initialGlobalSettingsRef = useRef(true);
    const initialKeymapSettingsRef = useRef(true);
    // Last translation-server failure already shown, so a save that fails the
    // same way again (every settings write retries the container) stays quiet.
    const shownTranslationServerErrorRef = useRef<string | null>(null);
    const [keymapConflicts, setKeymapConflicts] = useState<unknown[]>([]);

    useEffect(() => {
        let isMounted = true;

        void Promise.allSettled([
            TauriApi.loadGlobalSettings(),
            TauriApi.loadKeymapSettings(),
        ]).then(([globalResult, keymapResult]) => {
            if (!isMounted) {
                return;
            }

            if (globalResult.status === "fulfilled") {
                const loaded = mergeGlobalSettings(globalResult.value);
                setGlobalSettings((current) => ({
                    ...loaded,
                    recent_projects: mergeRecentProjectLists(
                        current.recent_projects,
                        loaded.recent_projects,
                    ),
                }));

                if (isLocale(loaded.locale)) {
                    setLocale(loaded.locale, { reload: false });
                    setActiveLocale(loaded.locale);
                }
            } else {
                setGlobalSettings((current) =>
                    current.recent_projects.length > 0
                        ? current
                        : DEFAULT_GLOBAL_SETTINGS,
                );
            }

            if (keymapResult.status === "fulfilled") {
                setKeymapSettings(mergeKeymapSettings(keymapResult.value));
            } else {
                setKeymapSettings(DEFAULT_KEYMAP_SETTINGS);
            }

            setSettingsLoaded(true);
        });

        return () => {
            isMounted = false;
        };
    }, []);

    const themeMode = normalizeThemeMode(globalSettings.theme_mode);
    useEffect(() => {
        if (themeMode === "system") {
            document.documentElement.removeAttribute("data-theme");
        } else {
            document.documentElement.dataset.theme = themeMode;
        }
    }, [themeMode]);

    useEffect(() => {
        if (!settingsLoaded) {
            return;
        }

        if (initialGlobalSettingsRef.current) {
            initialGlobalSettingsRef.current = false;
            return;
        }

        void TauriApi.saveGlobalSettings(globalSettings)
            .then((report) => {
                const error = report.translation_server_error;
                if (!error) {
                    shownTranslationServerErrorRef.current = null;
                    return;
                }
                if (error === shownTranslationServerErrorRef.current) {
                    return;
                }
                shownTranslationServerErrorRef.current = error;
                showToast(
                    m.settings_zotero_translation_server_start_failed_toast({
                        message: error,
                    }),
                    "error",
                );
            })
            .catch(() => undefined);
    }, [globalSettings, settingsLoaded]);

    useEffect(() => {
        if (!settingsLoaded) {
            return;
        }

        if (initialKeymapSettingsRef.current) {
            initialKeymapSettingsRef.current = false;
            return;
        }

        void TauriApi.saveKeymapSettings(keymapSettings).catch(() => undefined);
    }, [keymapSettings, settingsLoaded]);

    useEffect(() => {
        if (typeof TauriApi.validateKeymapSettings !== "function") {
            setKeymapConflicts([]);
            return;
        }

        void TauriApi.validateKeymapSettings(keymapSettings)
            .then((result) => setKeymapConflicts(result.conflicts))
            .catch(() => setKeymapConflicts([]));
    }, [keymapSettings]);

    const updateGlobalSettings = useCallback((settings: GlobalSettings) => {
        const nextSettings = mergeGlobalSettings(settings);
        if (isLocale(nextSettings.locale)) {
            setLocale(nextSettings.locale, { reload: false });
            setActiveLocale(nextSettings.locale);
        }
        setGlobalSettings(nextSettings);
    }, []);

    const updateKeymapSettings = useCallback((settings: KeymapSettings) => {
        setKeymapSettings(mergeKeymapSettings(settings));
    }, []);

    const setThemeMode = useCallback((nextThemeMode: ThemeMode) => {
        setGlobalSettings((current) =>
            mergeGlobalSettings({
                ...current,
                theme_mode: nextThemeMode,
            }),
        );
    }, []);

    const handleLocaleChange = useCallback((nextLocale: Locale) => {
        setLocale(nextLocale, { reload: false });
        setActiveLocale(nextLocale);
        setGlobalSettings((current) =>
            mergeGlobalSettings({
                ...current,
                locale: nextLocale,
            }),
        );
    }, []);

    const rememberProject = useCallback((path: string) => {
        setGlobalSettings((current) => {
            const next = [
                path,
                ...current.recent_projects.filter((item) => item !== path),
            ].slice(0, 8);
            return mergeGlobalSettings({
                ...current,
                recent_projects: next,
            });
        });
    }, []);

    const setWorkspaceColumns = useCallback((columns: WorkspaceColumnWidths) => {
        setGlobalSettings((current) =>
            current.workspace_columns?.sidebar === columns.sidebar &&
            current.workspace_columns?.editor === columns.editor
                ? current
                : mergeGlobalSettings({ ...current, workspace_columns: columns }),
        );
    }, []);

    const forgetProject = useCallback((path: string) => {
        setGlobalSettings((current) =>
            mergeGlobalSettings({
                ...current,
                recent_projects: current.recent_projects.filter(
                    (item) => item !== path,
                ),
            }),
        );
    }, []);

    const { keymap } = useMemo(
        () => createKeymapProfile(keymapSettings),
        [keymapSettings],
    );

    return {
        locale,
        settingsLoaded,
        globalSettings,
        keymapSettings,
        themeMode,
        keymap,
        keymapConflicts,
        updateGlobalSettings,
        updateKeymapSettings,
        setThemeMode,
        setLocale: handleLocaleChange,
        rememberProject,
        forgetProject,
        setWorkspaceColumns,
    };
};
