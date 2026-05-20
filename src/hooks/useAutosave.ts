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
        let unlisten: (() => void) | null = null;
        let isCleanedUp = false;
        const appWindow = getCurrentWindow();

        appWindow
            .onCloseRequested(async (event) => {
                // Tauri v2: preventDefault() must be called synchronously (before any
                // await) to actually intercept the close. We always prevent the default
                // and then close the window ourselves once done.
                event.preventDefault();

                if (isClosingWindowRef.current) {
                    // Second close call triggered by us after saving — actually close.
                    await appWindow.close();
                    return;
                }

                const needsSave =
                    autosaveOnAppCloseRef.current &&
                    hasActiveProjectRef.current &&
                    !!currentProjectPathRef.current &&
                    isDirtyRef.current;

                if (!needsSave) {
                    // Nothing to save — close immediately.
                    isClosingWindowRef.current = true;
                    await appWindow.close();
                    return;
                }

                try {
                    await saveActiveProjectRef.current();
                    isClosingWindowRef.current = true;
                    if (unlisten) {
                        unlisten();
                        unlisten = null;
                    }
                    await appWindow.close();
                } catch (error) {
                    window.alert(
                        m.project_save_failed({
                            message:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        }),
                    );
                }
            })
            .then((nextUnlisten) => {
                if (isCleanedUp || isClosingWindowRef.current) {
                    nextUnlisten();
                } else {
                    unlisten = nextUnlisten;
                }
            })
            .catch(() => undefined);

        return () => {
            isCleanedUp = true;
            if (unlisten) {
                unlisten();
            }
        };
    }, []);
};
