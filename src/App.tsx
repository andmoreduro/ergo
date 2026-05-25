import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Workspace } from "./components/layout/Workspace/Workspace";
import { Menubar } from "./components/layout/Menubar/Menubar";
import { WelcomeScreen } from "./components/screens/WelcomeScreen/WelcomeScreen";
import { ErrorBoundary } from "./components/screens/ErrorBoundary/ErrorBoundary";
import {
    SettingsDialog,
    type SettingsPanel,
} from "./components/organisms/SettingsDialog/SettingsDialog";
import {
    NewProjectDialog,
} from "./components/organisms/NewProjectDialog/NewProjectDialog";
import { DocumentProvider, useDocument } from "./state/DocumentContext";
import { createId } from "./state/ast/defaults";
import { m } from "./paraglide/messages.js";
import { createCommandRegistry } from "./commands/registry";
import type { Command, CommandContext } from "./commands/types";
import { workspaceCommands } from "./commands/workspaceCommands";
import { TauriApi } from "./api/tauri";
import { CompilerClient, warmupCompiler } from "./workers/compilerClient";
import { editorCommands } from "./commands/editorCommands";
import { viewCommands } from "./commands/viewCommands";
import { themeCommands } from "./commands/themeCommands";
import { editCommands } from "./commands/editCommands";
import { settingsCommands } from "./commands/settingsCommands";
import { helpCommands } from "./commands/helpCommands";
import {
    ActionContextProvider,
    ActionRuntimeProvider,
    useActionDispatcher,
} from "./actions/runtime";
import { ContextMenuProvider } from "./contextMenu/ContextMenuProvider";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { useAppActionHandlers } from "./hooks/useAppActionHandlers";
import { useAutosave } from "./hooks/useAutosave";
import { useSettingsLifecycle } from "./hooks/useSettingsLifecycle";
import { useProjectLifecycle } from "./hooks/useProjectLifecycle";
import {
    PREVIEW_ZOOM_DEFAULT,
    resolvePreviewZoomRenderDebounceMs,
    stepPreviewZoom,
} from "./preview/previewZoom";
import styles from "./App.module.css";

const AppShellContent = () => {
    const {
        state,
        dispatch,
        isDirty,
        canUndo,
        canRedo,
        undo,
        redo,
        markSaved,
        documentFocus,
        setDocumentFocus,
    } = useDocument();
    const {
        locale,
        globalSettings,
        keymapSettings,
        themeMode,
        keymap,
        keymapConflicts,
        updateGlobalSettings,
        updateKeymapSettings,
        setThemeMode,
        rememberProject,
        forgetProject,
    } = useSettingsLifecycle();
    const {
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
    } = useProjectLifecycle({
        dispatch,
        markSaved,
        isDirty,
        globalSettings,
        rememberProject,
    });
    const [settingsPanel, setSettingsPanel] = useState<SettingsPanel | null>(null);
    const [previewZoom, setPreviewZoom] = useState(PREVIEW_ZOOM_DEFAULT);
    const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandQuery, setCommandQuery] = useState("");
    const dispatchAction = useActionDispatcher();
    const recentProjects = globalSettings.recent_projects;
    const recentProjectsRef = useRef(recentProjects);
    recentProjectsRef.current = recentProjects;

    useAutosave({
        globalSettings,
        hasActiveProject,
        currentProjectPath,
        isDirty,
        saveActiveProject,
    });

    useEffect(() => {
        if (!hasActiveProject) {
            setPreviewZoom(PREVIEW_ZOOM_DEFAULT);
        }
    }, [hasActiveProject]);

    const zoomPreviewIn = useCallback(() => {
        setPreviewZoom((current) => stepPreviewZoom(current, 1));
    }, []);

    const zoomPreviewOut = useCallback(() => {
        setPreviewZoom((current) => stepPreviewZoom(current, -1));
    }, []);

    const insertElement = useCallback((elementType: "heading" | "paragraph" | "table" | "equation" | "figure") => {
        const contentSection = state.sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            return;
        }

        ensureActiveProject();

        const sectionId = contentSection.id;
        const id = createId();

        if (elementType === "heading") {
            dispatch({
                type: "ADD_HEADING",
                payload: { sectionId, headingId: id },
            });
            return;
        }

        if (elementType === "paragraph") {
            dispatch({
                type: "ADD_PARAGRAPH",
                payload: { sectionId, paragraphId: id },
            });
            return;
        }

        if (elementType === "table") {
            dispatch({
                type: "ADD_TABLE",
                payload: { sectionId, tableId: id },
            });
            return;
        }

        if (elementType === "equation") {
            dispatch({
                type: "ADD_EQUATION",
                payload: { sectionId, equationId: id },
            });
            return;
        }

        dispatch({
            type: "ADD_FIGURE",
            payload: { sectionId, figureId: id },
        });
    }, [dispatch, ensureActiveProject, state.sections]);

    const exportDocument = useCallback(async () => {
        try {
            const pdfBytes = await CompilerClient.exportPdf(state);
            await TauriApi.exportDocument("pdf", pdfBytes);
        } catch (error) {
            window.alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [state]);

    const commandContext = useMemo<CommandContext>(
        () => ({
            hasActiveProject,
            focusedElementId: documentFocus.elementId,
        }),
        [documentFocus.elementId, hasActiveProject],
    );

    const commands = useMemo<Command[]>(
        () => [
            ...workspaceCommands({
                showNewProjectDialog,
                openProject,
                saveProject,
                closeProject,
                recentProjectsRef,
                exportDocument,
            }),
            ...editorCommands({
                insertElement,
            }),
            ...viewCommands({
                setCommandPaletteOpen,
                zoomPreviewIn,
                zoomPreviewOut,
                isPreviewZoomEnabled: () => hasActiveProject,
            }),
            ...themeCommands({
                setThemeMode,
            }),
            ...editCommands({
                canUndo,
                canRedo,
                undo,
                redo,
            }),
            ...settingsCommands({
                setSettingsPanel,
                setCommandPaletteOpen,
            }),
            ...helpCommands(),
        ],
        [
            closeProject,
            canRedo,
            canUndo,
            insertElement,
            openProject,
            redo,
            saveProject,
            showNewProjectDialog,
            undo,
            exportDocument,
            hasActiveProject,
            zoomPreviewIn,
            zoomPreviewOut,
        ],
    );
    const commandRegistry = useMemo(
        () => createCommandRegistry(commands),
        [commands],
    );
    const {
        filteredCommands,
        runCommand,
    } = useCommandPalette({
        commandRegistry,
        dispatchAction,
        setOpen: setCommandPaletteOpen,
        query: commandQuery,
        setQuery: setCommandQuery,
    });
    const appActionHandlers = useAppActionHandlers({
        state,
        commandRegistry,
        commandContext,
        setDocumentFocus,
    });

    return (
        <ActionContextProvider
            id="app"
            contexts={["app"]}
            handlers={appActionHandlers}
        >
            <ContextMenuProvider
                commandRegistry={commandRegistry}
                commandContext={commandContext}
                runCommand={runCommand}
            >
                <div
                    className={styles.app}
                    key={locale}
                    data-theme={themeMode === "system" ? undefined : themeMode}
                >
                <Menubar
                    hasActiveProject={hasActiveProject}
                    onCommand={runCommand}
                    isCommandEnabled={(commandId) =>
                        commandRegistry.enabled(commandId, commandContext)
                    }
                />
                {hasActiveProject ? (
                    <ActionContextProvider id="workspace" contexts={["workspace"]}>
                        <Workspace
                            previewZoom={previewZoom}
                            onPreviewZoomChange={setPreviewZoom}
                            previewZoomRenderDebounceMs={resolvePreviewZoomRenderDebounceMs(
                                globalSettings.preview_zoom_render_debounce_ms,
                            )}
                        />
                    </ActionContextProvider>
                ) : (
                    <ActionContextProvider id="welcome" contexts={["welcome"]}>
                        <WelcomeScreen
                            recentProjects={recentProjects}
                            onNewProject={() => runCommand("workspace::NewProject")}
                            onOpenProject={() => runCommand("workspace::OpenProject")}
                            onOpenRecentProject={(path) => void openProject(path)}
                            onRemoveRecentProject={forgetProject}
                            onCommandPalette={() => runCommand("view::OpenCommandPalette")}
                        />
                    </ActionContextProvider>
                )}
                {isCommandPaletteOpen && (
                    <ActionContextProvider
                        id="command-palette"
                        contexts={["dialog", "commandPalette"]}
                    >
                        <div className={styles.paletteBackdrop}>
                            <div className={styles.palette} role="dialog" aria-modal="true">
                                <div className={styles.paletteHeader}>
                                    <h2>{m.command_palette_title()}</h2>
                                    <button
                                        type="button"
                                        onClick={() => runCommand("settings::Close")}
                                    >
                                        {m.command_palette_close()}
                                    </button>
                                </div>
                                <input
                                    autoFocus
                                    value={commandQuery}
                                    placeholder={m.command_palette_placeholder()}
                                    onChange={(event) => setCommandQuery(event.target.value)}
                                />
                                <div className={styles.commandList}>
                                    {filteredCommands.length > 0 ? (
                                        filteredCommands.map((command) => (
                                            <button
                                                type="button"
                                                disabled={
                                                    !commandRegistry.enabled(
                                                        command.id,
                                                        commandContext,
                                                    )
                                                }
                                                key={command.id}
                                                onClick={() => runCommand(command.id)}
                                            >
                                                {command.label}
                                            </button>
                                        ))
                                    ) : (
                                        <p>{m.command_palette_empty()}</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </ActionContextProvider>
                )}
                {settingsPanel && (
                    <ActionContextProvider
                        id="settings-dialog"
                        contexts={["dialog", "settings"]}
                    >
                        <SettingsDialog
                            panel={settingsPanel}
                            globalSettings={globalSettings}
                            projectSettings={state.metadata.project_settings}
                            keymap={keymap}
                            conflicts={keymapConflicts}
                            keymapSettings={keymapSettings}
                            onGlobalSettingsChange={updateGlobalSettings}
                            onKeymapSettingsChange={updateKeymapSettings}
                            onProjectSettingsChange={(settings) =>
                                dispatch({
                                    type: "UPDATE_PROJECT_SETTINGS",
                                    payload: { settings },
                                })
                            }
                            onClose={() => runCommand("settings::Close")}
                        />
                    </ActionContextProvider>
                )}
                {newProjectInitialName && newProjectInitialLocation !== null && (
                    <NewProjectDialog
                        initialProjectName={newProjectInitialName}
                        initialProjectLocation={newProjectInitialLocation}
                        onCancel={cancelNewProjectDialog}
                        onChooseLocation={chooseNewProjectLocation}
                        onCreate={createNewProject}
                    />
                )}
            </div>
            </ContextMenuProvider>
        </ActionContextProvider>
    );
};

const AppShell = () => (
    <ActionRuntimeProvider>
        <ErrorBoundary>
            <AppShellContent />
        </ErrorBoundary>
    </ActionRuntimeProvider>
);

function App() {
    useEffect(() => {
        warmupCompiler();
    }, []);

    return (
        <DocumentProvider>
            <AppShell />
        </DocumentProvider>
    );
}

export default App;
