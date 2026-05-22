import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { GlobalSettings } from "../bindings/GlobalSettings";
import { m } from "../paraglide/messages.js";

interface UseAutosaveOptions {
    globalSettings: GlobalSettings;
    hasActiveProject: boolean;
    currentProjectPath: string | null;
    isDirty: boolean;
    saveActiveProject: () => Promise<boolean>;
}

let globalUnlistenPromise: Promise<() => void> | null = null;

export const useAutosave = ({
    globalSettings,
    hasActiveProject,
    currentProjectPath,
    isDirty,
    saveActiveProject,
}: UseAutosaveOptions) => {
    const hasActiveProjectRef = useRef(hasActiveProject);
    hasActiveProjectRef.current = hasActiveProject;
    const currentProjectPathRef = useRef(currentProjectPath);
    currentProjectPathRef.current = currentProjectPath;
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const saveActiveProjectRef = useRef(saveActiveProject);
    saveActiveProjectRef.current = saveActiveProject;
    const autosaveOnAppCloseRef = useRef(globalSettings.autosave_on_app_close ?? true);
    autosaveOnAppCloseRef.current = globalSettings.autosave_on_app_close ?? true;

    const isClosingWindowRef = useRef(false);
    const isSavingRef = useRef(false);

    useEffect(() => {
        if (!(globalSettings.autosave_enabled ?? true)) {
            return;
        }

        const intervalMs = Math.max(
            1000,
            globalSettings.autosave_interval_ms ?? 30_000,
        );
        const intervalId = window.setInterval(() => {
            void saveActiveProjectRef.current().catch(() => undefined);
        }, intervalMs);

        return () => window.clearInterval(intervalId);
    }, [
        globalSettings.autosave_enabled,
        globalSettings.autosave_interval_ms,
    ]);

    useEffect(() => {
        if (!(globalSettings.autosave_on_window_blur ?? true)) {
            return;
        }

        const saveOnBlur = () => {
            void saveActiveProjectRef.current().catch(() => undefined);
        };

        window.addEventListener("blur", saveOnBlur);
        return () => window.removeEventListener("blur", saveOnBlur);
    }, [globalSettings.autosave_on_window_blur]);

    useEffect(() => {
        const appWindow = getCurrentWindow();

        // Clean up any previously registered listener from HMR
        if (globalUnlistenPromise) {
            globalUnlistenPromise.then((unlisten) => unlisten()).catch(() => {});
        }

        const currentPromise = appWindow.onCloseRequested(async (event) => {
            if (isClosingWindowRef.current) {
                // We already saved and initiated the close. Let the default close proceed!
                return;
            }

            const needsSave =
                autosaveOnAppCloseRef.current &&
                hasActiveProjectRef.current &&
                !!currentProjectPathRef.current &&
                isDirtyRef.current;

            if (!needsSave) {
                return;
            }

            // Tauri v2: preventDefault() must be called before saving so the
            // window stays alive until the backend archive write completes.
            event.preventDefault();

            if (isSavingRef.current) {
                // Already saving. Ignore duplicate close requests.
                return;
            }

            try {
                isSavingRef.current = true;
                await saveActiveProjectRef.current();
                isClosingWindowRef.current = true;
                await appWindow.destroy();
            } catch (error) {
                isSavingRef.current = false;
                window.alert(
                    m.project_save_failed({
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    }),
                );
            }
        });

        globalUnlistenPromise = currentPromise;

        return () => {
            currentPromise
                .then((unlisten) => {
                    unlisten();
                    if (globalUnlistenPromise === currentPromise) {
                        globalUnlistenPromise = null;
                    }
                })
                .catch(() => {});
        };
    }, []);
};
