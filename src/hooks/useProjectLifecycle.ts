import { useCallback, useRef, useState, type Dispatch } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

import { TauriApi } from "../api/tauri";
import { waitForDocumentSync } from "./documentSyncBarrier";
import type { GlobalSettings } from "../bindings/GlobalSettings";
import { m } from "../paraglide/messages.js";
import {
    ensureErgprojExtension,
    projectPathInDirectory,
} from "../project/paths";
import type { ASTAction } from "../state/ast/actions";
import {
    createDefaultDocumentAST,
    createDocumentAST,
} from "../state/ast/defaults";
import type { NewProjectDialogValues } from "../components/organisms/NewProjectDialog/NewProjectDialog";

interface UseProjectLifecycleOptions {
    dispatch: Dispatch<ASTAction>;
    markSaved: () => void;
    isDirty: boolean;
    globalSettings: GlobalSettings;
    rememberProject: (path: string) => void;
}

export const useProjectLifecycle = ({
    dispatch,
    markSaved,
    isDirty,
    globalSettings,
    rememberProject,
}: UseProjectLifecycleOptions) => {
    const [hasActiveProject, setHasActiveProject] = useState(false);
    const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
    const [newProjectInitialName, setNewProjectInitialName] = useState<
        string | null
    >(null);
    const [newProjectInitialLocation, setNewProjectInitialLocation] = useState<
        string | null
    >(null);

    const hasActiveProjectRef = useRef(hasActiveProject);
    hasActiveProjectRef.current = hasActiveProject;
    const currentProjectPathRef = useRef(currentProjectPath);
    currentProjectPathRef.current = currentProjectPath;
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;

    const saveActiveProject = useCallback(async (): Promise<boolean> => {
        const projectPath = currentProjectPathRef.current;
        if (
            !hasActiveProjectRef.current ||
            !projectPath ||
            !isDirtyRef.current
        ) {
            return false;
        }

        await waitForDocumentSync();
        await TauriApi.saveProject(projectPath);
        rememberProject(projectPath);
        markSaved();
        return true;
    }, [markSaved, rememberProject]);

    const saveBeforeProjectBoundary = useCallback(async (): Promise<boolean> => {
        if (!(globalSettings.autosave_on_project_close ?? true)) {
            return true;
        }

        try {
            await saveActiveProject();
            return true;
        } catch (error) {
            window.alert(
                m.project_save_failed({
                    message: error instanceof Error ? error.message : String(error),
                }),
            );
            return false;
        }
    }, [globalSettings.autosave_on_project_close, saveActiveProject]);

    const showNewProjectDialog = useCallback(() => {
        const defaultTitle = createDefaultDocumentAST().metadata.title;
        void TauriApi.documentDir()
            .then((projectLocation) => {
                setNewProjectInitialName(defaultTitle);
                setNewProjectInitialLocation(projectLocation);
            })
            .catch(() => {
                setNewProjectInitialName(defaultTitle);
                setNewProjectInitialLocation("");
            });
    }, []);

    const createNewProject = useCallback(
        async ({
            projectName,
            projectFileName,
            projectLocation,
            templateId,
        }: NewProjectDialogValues) => {
            if (!(await saveBeforeProjectBoundary())) {
                return;
            }

            const ast = createDocumentAST(templateId);
            ast.metadata.title = projectName;
            const projectPath = projectPathInDirectory(
                projectLocation,
                projectFileName,
            );

            try {
                dispatch({
                    type: "LOAD_DOCUMENT",
                    payload: { ast },
                });
                // Workspace (and useCompiler) mount only after the first save, so
                // materialize the backend session explicitly before writing .ergproj.
                await TauriApi.syncDocumentSnapshot(ast);
                await TauriApi.saveProject(projectPath);
                rememberProject(projectPath);
                setCurrentProjectPath(projectPath);
                setHasActiveProject(true);
                setNewProjectInitialName(null);
                setNewProjectInitialLocation(null);
                markSaved();
            } catch (error) {
                window.alert(
                    m.project_save_failed({
                        message:
                            error instanceof Error ? error.message : String(error),
                    }),
                );
            }
        },
        [dispatch, markSaved, rememberProject, saveBeforeProjectBoundary],
    );

    const chooseNewProjectLocation = useCallback(async () => {
        const selectedDirectory = await openDialog({
            directory: true,
            multiple: false,
            title: m.project_new_choose_folder(),
        });

        return typeof selectedDirectory === "string" ? selectedDirectory : null;
    }, []);

    const openProject = useCallback(
        async (path?: string) => {
            const selectedPath =
                path ??
                (await openDialog({
                    multiple: false,
                    filters: [{ name: "Érgo Project", extensions: ["ergproj"] }],
                }));
            const projectPath =
                typeof selectedPath === "string"
                    ? ensureErgprojExtension(selectedPath)
                    : null;
            if (!projectPath) {
                return;
            }

            if (!(await saveBeforeProjectBoundary())) {
                return;
            }

            try {
                const result = await TauriApi.openProject(projectPath);
                dispatch({
                    type: "LOAD_DOCUMENT",
                    payload: { ast: result.ast, projectFiles: result.files },
                });
                rememberProject(projectPath);
                setCurrentProjectPath(projectPath);
                setHasActiveProject(true);
            } catch (error) {
                window.alert(
                    m.project_open_failed({
                        message:
                            error instanceof Error ? error.message : String(error),
                    }),
                );
            }
        },
        [dispatch, rememberProject, saveBeforeProjectBoundary],
    );

    const saveProject = useCallback(async () => {
        if (!hasActiveProject) {
            return;
        }

        const selectedPath =
            currentProjectPath ??
            (await saveDialog({
                filters: [{ name: "Érgo Project", extensions: ["ergproj"] }],
            }));
        const projectPath =
            typeof selectedPath === "string"
                ? ensureErgprojExtension(selectedPath)
                : null;
        if (!projectPath) {
            return;
        }

        try {
            await waitForDocumentSync();
            await TauriApi.saveProject(projectPath);
            rememberProject(projectPath);
            setCurrentProjectPath(projectPath);
            markSaved();
        } catch (error) {
            window.alert(
                m.project_save_failed({
                    message: error instanceof Error ? error.message : String(error),
                }),
            );
        }
    }, [currentProjectPath, hasActiveProject, markSaved, rememberProject]);

    const closeProject = useCallback(async () => {
        if (!(await saveBeforeProjectBoundary())) {
            return;
        }

        const defaultAst = createDefaultDocumentAST();
        setHasActiveProject(false);
        setCurrentProjectPath(null);
        dispatch({
            type: "LOAD_DOCUMENT",
            payload: { ast: defaultAst },
        });

        try {
            await waitForDocumentSync();
            await TauriApi.syncDocumentSnapshot(defaultAst);
        } catch {
            // Welcome screen should still appear even if the backend reset fails.
        }
    }, [dispatch, saveBeforeProjectBoundary]);

    const ensureActiveProject = useCallback(() => {
        if (!hasActiveProjectRef.current) {
            setHasActiveProject(true);
        }
    }, []);

    const cancelNewProjectDialog = useCallback(() => {
        setNewProjectInitialName(null);
        setNewProjectInitialLocation(null);
    }, []);

    return {
        hasActiveProject,
        currentProjectPath,
        newProjectInitialName,
        newProjectInitialLocation,
        saveActiveProject,
        showNewProjectDialog,
        createNewProject,
        chooseNewProjectLocation,
        openProject,
        saveProject,
        closeProject,
        ensureActiveProject,
        cancelNewProjectDialog,
    };
};
