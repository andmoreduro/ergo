import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TauriApi } from "../api/tauri";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import { getLocale, locales, setLocale } from "../paraglide/runtime.js";
import type { Locale } from "../paraglide/runtime.js";
import {
    DEFAULT_GLOBAL_SETTINGS,
    DEFAULT_KEYMAP_SETTINGS,
    mergeGlobalSettings,
    mergeKeymapSettings,
    normalizeThemeMode,
    type ThemeMode,
} from "../settings/defaults";
import { createKeymapProfile } from "../settings/keymap";

const isLocale = (value: string | null): value is Locale =>
    locales.includes(value as Locale);

export const useSettingsLifecycle = () => {
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
    const [keymapConflicts, setKeymapConflicts] = useState<unknown[]>([]);

    useEffect(() => {
        let isMounted = true;

        void Promise.all([
            TauriApi.loadGlobalSettings(),
            TauriApi.loadKeymapSettings(),
        ])
            .then(([loadedSettings, loadedKeymapSettings]) => {
                if (!isMounted) {
                    return;
                }

                const nextSettings = mergeGlobalSettings(loadedSettings);
                const nextKeymapSettings =
                    mergeKeymapSettings(loadedKeymapSettings);
                setGlobalSettings(nextSettings);
                setKeymapSettings(nextKeymapSettings);

                if (isLocale(nextSettings.locale)) {
                    setLocale(nextSettings.locale, { reload: false });
                    setActiveLocale(nextSettings.locale);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setGlobalSettings(DEFAULT_GLOBAL_SETTINGS);
                    setKeymapSettings(DEFAULT_KEYMAP_SETTINGS);
                }
            })
            .finally(() => {
                if (isMounted) {
                    setSettingsLoaded(true);
                }
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

        void TauriApi.saveGlobalSettings(globalSettings).catch(() => undefined);
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
        globalSettings,
        keymapSettings,
        themeMode,
        keymap,
        keymapConflicts,
        updateGlobalSettings,
        updateKeymapSettings,
        setThemeMode,
        handleLocaleChange,
        rememberProject,
        forgetProject,
    };
};
