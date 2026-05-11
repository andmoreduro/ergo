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
            void saveActiveProject().catch(() => undefined);
        }, intervalMs);

        return () => window.clearInterval(intervalId);
    }, [
        globalSettings.autosave_enabled,
        globalSettings.autosave_interval_ms,
        saveActiveProject,
    ]);

    useEffect(() => {
        if (!(globalSettings.autosave_on_window_blur ?? true)) {
            return;
        }

        const saveOnBlur = () => {
            void saveActiveProject().catch(() => undefined);
        };

        window.addEventListener("blur", saveOnBlur);
        return () => window.removeEventListener("blur", saveOnBlur);
    }, [globalSettings.autosave_on_window_blur, saveActiveProject]);

    useEffect(() => {
        let unlisten: (() => void) | null = null;
        const appWindow = getCurrentWindow();

        void appWindow
            .onCloseRequested(async (event) => {
                if (isClosingWindowRef.current) {
                    return;
                }

                if (
                    !(globalSettings.autosave_on_app_close ?? true) ||
                    !hasActiveProjectRef.current ||
                    !currentProjectPathRef.current ||
                    !isDirtyRef.current
                ) {
                    return;
                }

                event.preventDefault();
                try {
                    await saveActiveProject();
                    isClosingWindowRef.current = true;
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
                unlisten = nextUnlisten;
            })
            .catch(() => undefined);

        return () => {
            unlisten?.();
        };
    }, [globalSettings.autosave_on_app_close, saveActiveProject]);
};
