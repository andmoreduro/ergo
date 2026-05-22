import { useCallback, useMemo, useRef, useState } from "react";
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
import { TauriApi } from "./api/tauri";
import { DocumentProvider, useDocument } from "./state/DocumentContext";
import { createId } from "./state/ast/defaults";
import { m } from "./paraglide/messages.js";
import { createCommandRegistry } from "./commands/registry";
import type { Command, CommandContext } from "./commands/types";
import {
    ActionContextProvider,
    ActionRuntimeProvider,
    useActionDispatcher,
} from "./actions/runtime";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { useAppActionHandlers } from "./hooks/useAppActionHandlers";
import { useAutosave } from "./hooks/useAutosave";
import { useSettingsLifecycle } from "./hooks/useSettingsLifecycle";
import { useProjectLifecycle } from "./hooks/useProjectLifecycle";
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
    const dispatchAction = useActionDispatcher();
    const recentProjects = globalSettings.recent_projects;
    const recentProjectsRef = useRef(recentProjects);
    recentProjectsRef.current = recentProjects;
    const previewDebounceMs = globalSettings.preview_debounce_enabled
        ? Math.max(0, globalSettings.preview_debounce_ms ?? 0)
        : 0;

    useAutosave({
        globalSettings,
        hasActiveProject,
        currentProjectPath,
        isDirty,
        saveActiveProject,
    });

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

    const commandContext = useMemo<CommandContext>(
        () => ({
            hasActiveProject,
            focusedElementId: documentFocus.elementId,
        }),
        [documentFocus.elementId, hasActiveProject],
    );

    const commands = useMemo<Command[]>(
        () => [
            {
                id: "workspace::NewProject",
                label: m.menubar_new_project(),
                scope: "global",
                run: showNewProjectDialog,
            },
            {
                id: "workspace::OpenProject",
                label: m.menubar_open_project(),
                scope: "global",
                run: () => openProject(),
            },
            {
                id: "workspace::OpenRecentProject",
                label: m.action_workspace_open_recent_project(),
                scope: "global",
                run: () => {
                    const recent = recentProjectsRef.current[0];
                    if (recent) void openProject(recent);
                },
                isEnabled: () => recentProjectsRef.current.length > 0,
            },
            {
                id: "workspace::SaveProject",
                label: m.menubar_save_project(),
                scope: "project",
                isEnabled: (context) => context.hasActiveProject,
                run: saveProject,
            },
            {
                id: "workspace::CloseProject",
                label: m.menubar_close_project(),
                scope: "project",
                isEnabled: (context) => context.hasActiveProject,
                run: closeProject,
            },
            {
                id: "workspace::ExportSvg",
                label: m.menubar_export(),
                scope: "project",
                isEnabled: (context) => context.hasActiveProject,
                run: () => void TauriApi.enqueueExport("svg"),
            },
            {
                id: "editor::InsertParagraph",
                label: m.menubar_insert_paragraph(),
                scope: "editor",
                run: () => insertElement("paragraph"),
            },
            {
                id: "editor::InsertHeading",
                label: m.menubar_insert_heading(),
                scope: "editor",
                run: () => insertElement("heading"),
            },
            {
                id: "editor::InsertTable",
                label: m.menubar_insert_table(),
                scope: "editor",
                run: () => insertElement("table"),
            },
            {
                id: "editor::InsertEquation",
                label: m.menubar_insert_equation(),
                scope: "editor",
                run: () => insertElement("equation"),
            },
            {
                id: "editor::InsertFigure",
                label: m.menubar_insert_figure(),
                scope: "editor",
                run: () => insertElement("figure"),
            },
            {
                id: "view::OpenCommandPalette",
                label: m.menubar_command_palette(),
                scope: "global",
                run: () => setCommandPaletteOpen(true),
            },
            {
                id: "theme::UseSystem",
                label: m.menubar_theme_system(),
                scope: "global",
                run: () => setThemeMode("system"),
            },
            {
                id: "theme::UseLight",
                label: m.menubar_theme_light(),
                scope: "global",
                run: () => setThemeMode("light"),
            },
            {
                id: "theme::UseDark",
                label: m.menubar_theme_dark(),
                scope: "global",
                run: () => setThemeMode("dark"),
            },
            {
                id: "edit::Undo",
                label: m.menubar_undo(),
                scope: "project",
                isEnabled: () => canUndo,
                run: undo,
            },
            {
                id: "edit::Redo",
                label: m.menubar_redo(),
                scope: "project",
                isEnabled: () => canRedo,
                run: redo,
            },
            {
                id: "editor::DeleteElement",
                label: m.menubar_delete_element(),
                scope: "editor",
                isEnabled: () => false,
                run: () => undefined,
            },
            {
                id: "editor::InsertReference",
                label: m.menubar_insert_reference(),
                scope: "editor",
                isEnabled: () => false,
                run: () => undefined,
            },
            {
                id: "view::ZoomIn",
                label: m.menubar_zoom_in(),
                scope: "global",
                isEnabled: () => false,
                run: () => undefined,
            },
            {
                id: "view::ZoomOut",
                label: m.menubar_zoom_out(),
                scope: "global",
                isEnabled: () => false,
                run: () => undefined,
            },
            {
                id: "settings::OpenGlobal",
                label: m.menubar_global_settings(),
                scope: "global",
                run: () => setSettingsPanel("global"),
            },
            {
                id: "settings::OpenProject",
                label: m.menubar_project_settings(),
                scope: "project",
                isEnabled: (context) => context.hasActiveProject,
                run: () => setSettingsPanel("project"),
            },
            {
                id: "settings::OpenKeymap",
                label: m.menubar_keymap_settings(),
                scope: "global",
                run: () => setSettingsPanel("keymap"),
            },
            {
                id: "settings::Close",
                label: m.command_palette_close(),
                scope: "global",
                run: () => {
                    setSettingsPanel(null);
                    setCommandPaletteOpen(false);
                },
            },
            {
                id: "help::OpenDocumentation",
                label: m.menubar_documentation(),
                scope: "global",
                isEnabled: () => false,
                run: () => undefined,
            },
            {
                id: "help::OpenAbout",
                label: m.menubar_about(),
                scope: "global",
                isEnabled: () => false,
                run: () => undefined,
            },
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
        ],
    );
    const commandRegistry = useMemo(
        () => createCommandRegistry(commands),
        [commands],
    );
    const {
        isOpen: isCommandPaletteOpen,
        setOpen: setCommandPaletteOpen,
        query: commandQuery,
        setQuery: setCommandQuery,
        filteredCommands,
        runCommand,
    } = useCommandPalette({ commandRegistry, dispatchAction });
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
            <div
                className={styles.app}
                key={locale}
                data-theme={themeMode === "system" ? undefined : themeMode}
            >
                <Menubar
                    hasActiveProject={hasActiveProject}
                    themeMode={themeMode}
                    onCommand={runCommand}
                    isCommandEnabled={(commandId) =>
                        commandRegistry.enabled(commandId, commandContext)
                    }
                />
                {hasActiveProject ? (
                    <ActionContextProvider id="workspace" contexts={["workspace"]}>
                        <Workspace previewDebounceMs={previewDebounceMs} />
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
    return (
        <DocumentProvider>
            <AppShell />
        </DocumentProvider>
    );
}

export default App;
