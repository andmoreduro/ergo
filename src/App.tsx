import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
    type NewProjectDialogValues,
} from "./components/organisms/NewProjectDialog/NewProjectDialog";
import { TauriApi } from "./api/tauri";
import { DocumentProvider, useDocument } from "./state/DocumentContext";
import { createDefaultDocumentAST, createId } from "./state/ast/defaults";
import { getLocale, locales, setLocale } from "./paraglide/runtime.js";
import type { Locale } from "./paraglide/runtime.js";
import { m } from "./paraglide/messages.js";
import { createCommandRegistry } from "./commands/registry";
import type { Command, CommandContext, CommandId } from "./commands/types";
import {
    ActionContextProvider,
    ActionRuntimeProvider,
    useActionDispatcher,
    type ActionHandlerMap,
} from "./actions/runtime";
import {
    DEFAULT_KEYMAP_SETTINGS,
    DEFAULT_GLOBAL_SETTINGS,
    mergeGlobalSettings,
    mergeKeymapSettings,
    normalizeThemeMode,
    type ThemeMode,
} from "./settings/defaults";
import { createKeymapProfile } from "./settings/keymap";
import type { GlobalSettings } from "./bindings/GlobalSettings";
import type { KeymapSettings } from "./bindings/KeymapSettings";
import type { ActionDescriptor } from "./bindings/ActionDescriptor";
import {
    ensureErgprojExtension,
    projectPathInDirectory,
} from "./project/paths";
import {
    coverTitleFieldId,
    defaultFieldIdForElement,
} from "./editor/fieldIds";
import styles from "./App.module.css";

const isLocale = (value: string | null): value is Locale =>
    locales.includes(value as Locale);

interface FocusFieldPayload {
    elementId: string;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    sourceRevision: number | null;
}

const parseFocusFieldPayload = (payload: unknown): FocusFieldPayload | null => {
    if (typeof payload !== "object" || payload === null) {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const elementId = readString(record.elementId);
    if (!elementId) {
        return null;
    }

    return {
        elementId,
        fieldId: readString(record.fieldId),
        caretUtf16Offset: readNumber(record.caretUtf16Offset),
        sourceRevision: readNumber(record.sourceRevision),
    };
};

const readString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

const readNumber = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "bigint") {
        return Number(value);
    }

    return null;
};

const defaultFieldIdForFocus = (
    state: ReturnType<typeof createDefaultDocumentAST>,
    elementId: string,
): string | null => {
    for (const section of state.sections) {
        if (section.type === "CoverPage" && section.id === elementId) {
            return coverTitleFieldId(section.id);
        }

        if (section.type === "Content") {
            const element = section.elements.find((entry) => entry.id === elementId);
            if (element) {
                return defaultFieldIdForElement(element);
            }
        }
    }

    return null;
};

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
    const [hasActiveProject, setHasActiveProject] = useState(false);
    const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
    const [locale, setActiveLocale] = useState<Locale>(getLocale());
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(
        DEFAULT_GLOBAL_SETTINGS,
    );
    const [keymapSettings, setKeymapSettings] = useState<KeymapSettings>(
        DEFAULT_KEYMAP_SETTINGS,
    );
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const initialSettingsRef = useRef(true);
    const [settingsPanel, setSettingsPanel] = useState<SettingsPanel | null>(null);
    const [newProjectInitialName, setNewProjectInitialName] = useState<
        string | null
    >(null);
    const [newProjectInitialLocation, setNewProjectInitialLocation] = useState<
        string | null
    >(null);
    const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandQuery, setCommandQuery] = useState("");
    const [actionCatalog, setActionCatalog] = useState<ActionDescriptor[]>([]);
    const dispatchAction = useActionDispatcher();
    const themeMode = normalizeThemeMode(globalSettings.theme_mode);
    const recentProjects = globalSettings.recent_projects;
    const recentProjectsRef = useRef(recentProjects);
    recentProjectsRef.current = recentProjects;
    const stateRef = useRef(state);
    stateRef.current = state;
    const hasActiveProjectRef = useRef(hasActiveProject);
    hasActiveProjectRef.current = hasActiveProject;
    const currentProjectPathRef = useRef(currentProjectPath);
    currentProjectPathRef.current = currentProjectPath;
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const isClosingWindowRef = useRef(false);
    const previewDebounceMs = globalSettings.preview_debounce_enabled
        ? Math.max(0, globalSettings.preview_debounce_ms ?? 0)
        : 0;
    const { keymap } = useMemo(
        () => createKeymapProfile(keymapSettings),
        [keymapSettings],
    );
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

    useEffect(() => {
        if (typeof TauriApi.getActionCatalog !== "function") {
            return;
        }

        let isMounted = true;
        void TauriApi.getActionCatalog()
            .then((catalog) => {
                if (isMounted) {
                    setActionCatalog(catalog);
                }
            })
            .catch(() => undefined);

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (themeMode === "system") {
            document.documentElement.removeAttribute("data-theme");
        } else {
            document.documentElement.dataset.theme = themeMode;
        }
    }, [themeMode]);

    useEffect(() => {
        if (!settingsLoaded || initialSettingsRef.current) {
            initialSettingsRef.current = false;
            return;
        }

        void TauriApi.saveGlobalSettings(globalSettings).catch(() => undefined);
    }, [globalSettings, settingsLoaded]);

    useEffect(() => {
        if (!settingsLoaded || initialSettingsRef.current) {
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
        setGlobalSettings(mergeGlobalSettings(settings));
    }, []);

    const setThemeMode = useCallback((nextThemeMode: ThemeMode) => {
        setGlobalSettings((current) =>
            mergeGlobalSettings({
                ...current,
                theme_mode: nextThemeMode,
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

    const saveActiveProject = useCallback(async (): Promise<boolean> => {
        const projectPath = currentProjectPathRef.current;
        if (
            !hasActiveProjectRef.current ||
            !projectPath ||
            !isDirtyRef.current
        ) {
            return false;
        }

        await TauriApi.saveProject(projectPath, stateRef.current);
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

    const handleLocaleChange = (nextLocale: Locale) => {
        setLocale(nextLocale, { reload: false });
        setActiveLocale(nextLocale);
        setGlobalSettings((current) =>
            mergeGlobalSettings({
                ...current,
                locale: nextLocale,
            }),
        );
    };

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

    const createNewProject = useCallback(async ({
        projectName,
        projectFileName,
        projectLocation,
    }: NewProjectDialogValues) => {
        if (!(await saveBeforeProjectBoundary())) {
            return;
        }

        const ast = createDefaultDocumentAST();
        ast.metadata.title = projectName;
        const projectPath = projectPathInDirectory(projectLocation, projectFileName);

        try {
            await TauriApi.saveProject(projectPath, ast);
            dispatch({
                type: "LOAD_DOCUMENT",
                payload: { ast },
            });
            rememberProject(projectPath);
            setCurrentProjectPath(projectPath);
            setHasActiveProject(true);
            setNewProjectInitialName(null);
            setNewProjectInitialLocation(null);
            markSaved();
        } catch (error) {
            window.alert(
                m.project_save_failed({
                    message: error instanceof Error ? error.message : String(error),
                }),
            );
        }
    }, [dispatch, markSaved, rememberProject, saveBeforeProjectBoundary]);

    const chooseNewProjectLocation = useCallback(async () => {
        const selectedDirectory = await openDialog({
            directory: true,
            multiple: false,
            title: m.project_new_choose_folder(),
        });

        return typeof selectedDirectory === "string" ? selectedDirectory : null;
    }, []);

    const openProject = useCallback(async (path?: string) => {
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
            const ast = await TauriApi.openProject(projectPath);
            dispatch({ type: "LOAD_DOCUMENT", payload: { ast } });
            rememberProject(projectPath);
            setCurrentProjectPath(projectPath);
            setHasActiveProject(true);
        } catch (error) {
            window.alert(
                m.project_open_failed({
                    message: error instanceof Error ? error.message : String(error),
                }),
            );
        }
    }, [dispatch, rememberProject, saveBeforeProjectBoundary]);

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
            await TauriApi.saveProject(projectPath, state);
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
    }, [currentProjectPath, hasActiveProject, markSaved, rememberProject, state]);

    const closeProject = useCallback(async () => {
        if (!(await saveBeforeProjectBoundary())) {
            return;
        }

        setHasActiveProject(false);
        setCurrentProjectPath(null);
        dispatch({
            type: "LOAD_DOCUMENT",
            payload: { ast: createDefaultDocumentAST() },
        });
    }, [dispatch, saveBeforeProjectBoundary]);

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

    const insertElement = useCallback((elementType: "heading" | "paragraph" | "table" | "equation" | "figure") => {
        const contentSection = state.sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            return;
        }

        if (!hasActiveProject) {
            setHasActiveProject(true);
        }

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
    }, [dispatch, hasActiveProject, state.sections]);

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
    const paletteCommands = useMemo<Command[]>(() => {
        if (actionCatalog.length === 0) {
            return commandRegistry.all();
        }

        return actionCatalog.map((descriptor) => {
            const command = commandRegistry.get(descriptor.id);
            if (command) {
                return command;
            }

            return {
                id: descriptor.id,
                label: descriptor.id,
                scope: "global",
                isEnabled: () => false,
                run: () => undefined,
            };
        });
    }, [actionCatalog, commandRegistry]);
    const deferredCommandQuery = useDeferredValue(commandQuery);
    const filteredCommands = paletteCommands.filter((command) =>
        command.label.toLowerCase().includes(deferredCommandQuery.toLowerCase()),
    );

    const runCommand = useCallback((commandId: CommandId) => {
        setCommandPaletteOpen(false);
        setCommandQuery("");
        void dispatchAction({ id: commandId, payload: null });
    }, [dispatchAction]);

    const appActionHandlers = useMemo<ActionHandlerMap>(() => {
        const handlers: ActionHandlerMap = {};

        handlers["editor::FocusField"] = (invocation) => {
            const target = parseFocusFieldPayload(invocation.payload);
            if (!target) {
                return false;
            }

            const fieldId =
                target.fieldId ??
                defaultFieldIdForFocus(stateRef.current, target.elementId);
            setDocumentFocus({
                elementId: target.elementId,
                fieldId,
                caretUtf16Offset: target.caretUtf16Offset,
                sourceRevision: target.sourceRevision,
                focusSource: "preview",
            });
            return true;
        };

        for (const command of commandRegistry.all()) {
            handlers[command.id] = () => {
                void commandRegistry.run(command.id, commandContext);
                return true;
            };
        }

        return handlers;
    }, [commandContext, commandRegistry, setDocumentFocus]);

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
                    activeLocale={locale}
                    themeMode={themeMode}
                    onLocaleChange={handleLocaleChange}
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
                            onKeymapSettingsChange={(settings) =>
                                setKeymapSettings(mergeKeymapSettings(settings))
                            }
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
                        onCancel={() => {
                            setNewProjectInitialName(null);
                            setNewProjectInitialLocation(null);
                        }}
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
