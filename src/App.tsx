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
import {
    DocumentProvider,
    useDocumentActions,
    useDocumentAstSelector,
    useDocumentAstStore,
    useDocumentFocusSelector,
    useDocumentFocusStore,
    useDocumentReconcile,
} from "./state/DocumentContext";
import type { TemplateOverride } from "./bindings/TemplateOverride";
import type { TemplateVariantSpec } from "./bindings/TemplateVariantSpec";
import type { TemplateSpec } from "./bindings/TemplateSpec";
import { useTemplateTranslation } from "./hooks/useTemplateTranslation";
import {
    createEnumeration,
    createEquation,
    createId,
    createList,
    createParagraph,
    createQuote,
} from "./state/ast/defaults";
import { buildInsertInTableCellAction } from "./editor/prosemirror/table/tableCellInsert";
import {
    isTableCellForbiddenInsert,
    resolveTableCellEditContext,
} from "./editor/prosemirror/table/tableCellInsertPolicy";
import {
    defaultFieldIdForElement,
    equationSourceFieldId,
    figureBodyFieldId,
    listItemFieldId,
    quoteContentFieldId,
    richTextFieldId,
} from "./editor/fieldIds";
import { m } from "./paraglide/messages.js";
import { createCommandRegistry } from "./commands/registry";
import type { ActionId, Command, CommandContext } from "./commands/types";
import { workspaceCommands } from "./commands/workspaceCommands";
import { TauriApi } from "./api/tauri";
import type { EquationSyntax } from "./bindings/EquationSyntax";
import type { ExportFormat } from "./bindings/ExportFormat";
import type { RichText } from "./bindings/RichText";
import { exportPdfFileNameFromProjectPath } from "./project/paths";
import { pageExportFileName, saveExportDialog } from "./platform/export";
import { CompilerClient, warmupCompiler } from "./workers/compilerClient";
import {
    editorCommands,
    type ElementType,
    type InsertElementOptions,
} from "./commands/editorCommands";
import { viewCommands } from "./commands/viewCommands";
import { themeCommands } from "./commands/themeCommands";
import { editCommands } from "./commands/editCommands";
import { settingsCommands } from "./commands/settingsCommands";
import { helpCommands } from "./commands/helpCommands";
import { applyRichTextMarkToFocusedField } from "./editor/richTextMarks";
import {
    applyBodyMark,
    getActiveBodyView,
    getActiveTableCellEditor,
} from "./editor/prosemirror/activeView";
import { tryBodyContentInsert } from "./editor/bodyContentInsert";
import { resolveBodyInsertAnchor } from "./editor/bodyInsertAnchor";
import { parseHeadingInsertLevel } from "./editor/headingInsert";
import { resolveContentInsertAnchor } from "./editor/insertContext";
import { insertBodyInlineEquation } from "./editor/prosemirror/bodyInsert";
import { setPendingBlockEdit } from "./editor/prosemirror/pendingBlockEdit";
import {
    insertInlineEquationAtOffset,
    richTextPlainLength,
} from "./richText/richText";
import {
    ActionContextProvider,
    ActionRuntimeProvider,
    useActionDispatcher,
} from "./actions/runtime";
import { ContextMenuProvider } from "./components/organisms/ContextMenu/ContextMenuProvider";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { useAppActionHandlers } from "./hooks/useAppActionHandlers";
import { useAutosave } from "./hooks/useAutosave";
import { useScrollRegionReveal } from "./hooks/useScrollRegionReveal";
import { useSettingsLifecycle } from "./hooks/useSettingsLifecycle";
import { useProjectLifecycle } from "./hooks/useProjectLifecycle";
import {
    PREVIEW_ZOOM_DEFAULT,
    type PreviewZoomMode,
    stepPreviewZoom,
} from "./preview/previewZoom";
import { CommandPalette } from "./components/organisms/CommandPalette/CommandPalette";
import styles from "./App.module.css";

const AppShellContent = () => {
    // Narrow subscriptions: the app shell must not re-render on every keystroke.
    // Mutators are identity-stable; the live AST/focus are read imperatively in
    // callbacks via the stores; only rarely-changing slices subscribe.
    const { dispatch, undo, redo, markSaved, setDocumentFocus } =
        useDocumentActions();
    const { canUndo, canRedo, isDirty } = useDocumentReconcile();
    const astStore = useDocumentAstStore();
    const focusStore = useDocumentFocusStore();
    const getState = useCallback(() => astStore.getSnapshot(), [astStore]);
    const templateId = useDocumentAstSelector((s) => s.metadata.template_id);
    const projectSettings = useDocumentAstSelector(
        (s) => s.metadata.project_settings,
    );
    const templateVariantId = useDocumentAstSelector(
        (s) => s.metadata.template_variant_id,
    );
    const focusedElementId = useDocumentFocusSelector((f) => f.elementId);
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
    const [templateSpec, setTemplateSpec] = useState<TemplateSpec | null>(null);
    const [templateVariants, setTemplateVariants] = useState<TemplateVariantSpec[]>([]);
    const [templateDefaultOverrides, setTemplateDefaultOverrides] = useState<
        TemplateOverride[]
    >([]);
    const t = useTemplateTranslation(templateSpec);
    const [previewZoom, setPreviewZoom] = useState(PREVIEW_ZOOM_DEFAULT);
    const [previewZoomMode, setPreviewZoomMode] =
        useState<PreviewZoomMode>("manual");
    const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandQuery, setCommandQuery] = useState("");
    const [systemFonts, setSystemFonts] = useState<string[]>([]);
    const dispatchAction = useActionDispatcher();
    const recentProjects = globalSettings.recent_projects;

    useEffect(() => {
        if (!hasActiveProject) {
            setTemplateSpec(null);
            setTemplateVariants([]);
            setTemplateDefaultOverrides([]);
            return;
        }

        let cancelled = false;
        void TauriApi.getTemplateSpec(templateId).then((spec) => {
            if (!cancelled) {
                setTemplateSpec(spec);
                setTemplateVariants(spec.editor.variants);
                setTemplateDefaultOverrides(spec.typst.default_template_overrides ?? []);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [hasActiveProject, templateId]);
    // Enumerate system fonts once a project is open, so the project settings
    // font pickers have their option list ready before the dialog opens.
    useEffect(() => {
        if (!hasActiveProject || systemFonts.length > 0) {
            return;
        }
        let cancelled = false;
        void TauriApi.listSystemFontFamilies().then((fonts) => {
            if (!cancelled) {
                setSystemFonts(fonts);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [hasActiveProject, systemFonts.length]);

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
            setPreviewZoomMode("manual");
        }
    }, [hasActiveProject]);

    const zoomPreviewIn = useCallback(() => {
        setPreviewZoomMode("manual");
        setPreviewZoom((current) => stepPreviewZoom(current, 1));
    }, []);

    const zoomPreviewOut = useCallback(() => {
        setPreviewZoomMode("manual");
        setPreviewZoom((current) => stepPreviewZoom(current, -1));
    }, []);

    const insertInlineEquation = useCallback((syntax: EquationSyntax = "typst") => {
        if (insertBodyInlineEquation("", syntax)) {
            return true;
        }

        const focus = focusStore.getSnapshot();
        const elementId = focus.elementId;
        const fieldId = focus.fieldId;
        if (!elementId || !fieldId) {
            return false;
        }

        const contentSection = getState().sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            return false;
        }

        const element = contentSection.elements.find(
            (entry) => entry.id === elementId,
        );
        if (!element) {
            return false;
        }

        const insertAt = (content: RichText[]) =>
            insertInlineEquationAtOffset(
                content,
                focus.caretUtf16Offset ?? richTextPlainLength(content),
                "x",
                syntax,
            );

        if (
            element.type === "Paragraph" &&
            fieldId === richTextFieldId(element.id)
        ) {
            dispatch({
                type: "UPDATE_PARAGRAPH_CONTENT",
                payload: {
                    paragraphId: element.id,
                    content: insertAt(element.content),
                },
            });
            return true;
        }

        if (element.type === "Heading" && fieldId === richTextFieldId(element.id)) {
            dispatch({
                type: "UPDATE_HEADING_CONTENT",
                payload: {
                    headingId: element.id,
                    content: insertAt(element.content),
                },
            });
            return true;
        }

        if (element.type === "Quote" && fieldId === quoteContentFieldId(element.id)) {
            dispatch({
                type: "UPDATE_QUOTE_CONTENT",
                payload: {
                    quoteId: element.id,
                    content: insertAt(element.content),
                },
            });
            return true;
        }

        if (
            element.type === "Figure" &&
            fieldId === figureBodyFieldId(element.id) &&
            element.content.type === "Paragraph"
        ) {
            dispatch({
                type: "UPDATE_PARAGRAPH_CONTENT",
                payload: {
                    paragraphId: element.content.id,
                    content: insertAt(element.content.content),
                },
            });
            return true;
        }

        if (element.type === "List" || element.type === "Enumeration") {
            const itemIndex = element.items.findIndex(
                (_, index) => fieldId === listItemFieldId(element.id, index),
            );
            if (itemIndex === -1) {
                return false;
            }
            const content = insertAt(element.items[itemIndex] ?? []);
            if (element.type === "List") {
                dispatch({
                    type: "UPDATE_LIST_ITEM",
                    payload: {
                        listId: element.id,
                        itemIndex,
                        content,
                    },
                });
                return true;
            }
            dispatch({
                type: "UPDATE_ENUMERATION_ITEM",
                payload: {
                    enumerationId: element.id,
                    itemIndex,
                    content,
                },
            });
            return true;
        }

        return false;
    }, [dispatch, focusStore, getState]);

    const applyRichTextMark = useCallback(
        (mark: "bold" | "italic" | "underline") => {
            // Body/table editing lives in ProseMirror; never run execCommand there
            // (browser underline fights PM marks, especially Ctrl+U).
            if (applyBodyMark(mark)) {
                return;
            }
            if (getActiveBodyView() || getActiveTableCellEditor()) {
                return;
            }
            applyRichTextMarkToFocusedField(mark, focusStore.getSnapshot().fieldId);
        },
        [focusStore],
    );

    const insertElement = useCallback((
        elementType: ElementType,
        options?: InsertElementOptions,
        invocationPayload?: unknown,
    ) => {
        if (tryBodyContentInsert(elementType, options, invocationPayload)) {
            return;
        }

        const state = getState();
        const focus = focusStore.getSnapshot();
        const contentSection = state.sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            return;
        }

        ensureActiveProject();

        const defaultEquationSyntax: EquationSyntax =
            globalSettings.default_equation_syntax ?? "typst";

        const tableCellCtx = resolveTableCellEditContext(
            state,
            focus.elementId,
            focus.fieldId,
        );
        if (tableCellCtx) {
            if (isTableCellForbiddenInsert(elementType)) {
                return;
            }
            const id = createId();
            let block = null as ReturnType<typeof createParagraph> | null;
            switch (elementType) {
                case "paragraph":
                    block = createParagraph("", id);
                    break;
                case "quote":
                    block = createQuote("", id);
                    break;
                case "list":
                    block = createList(id);
                    break;
                case "enumeration":
                    block = createEnumeration(id);
                    break;
                case "equation":
                    block = createEquation(id, "", defaultEquationSyntax);
                    break;
                default:
                    break;
            }
            if (block) {
                dispatch(buildInsertInTableCellAction(tableCellCtx, block));
                const focusElementId =
                    block.type === "Paragraph" ? tableCellCtx.tableId : block.id;
                const focusFieldId =
                    block.type === "Paragraph"
                        ? richTextFieldId(block.id)
                        : block.type === "Quote"
                          ? quoteContentFieldId(block.id)
                          : block.type === "Equation"
                            ? equationSourceFieldId(block.id)
                            : listItemFieldId(block.id, 0);
                setDocumentFocus({
                    elementId: focusElementId,
                    fieldId: focusFieldId,
                    caretUtf16Offset: 0,
                    sourceRevision: null,
                    anchorPageNumber: null,
                    forcePreviewScroll: false,
                    focusSource: "programmatic",
                });
                return;
            }
            if (elementType === "inlineEquation") {
                if (insertInlineEquation(defaultEquationSyntax)) {
                    return;
                }
            }
            return;
        }

        const sectionId = contentSection.id;
        const id = elementType === "diagram" ? `diagram-${createId()}` : createId();
        const bodyView = getActiveBodyView();
        const bodyInsertAnchor = resolveBodyInsertAnchor(bodyView);
        const anchorElementId = bodyInsertAnchor
            ? bodyInsertAnchor.afterElementId
            : focus.elementId &&
                focus.elementId !== "project" &&
                focus.elementId !== "inputs"
              ? focus.elementId
              : undefined;
        const { afterElementId, replaceElementId: replaceTargetId } =
            resolveContentInsertAnchor(contentSection, anchorElementId);

        const finishInsert = (
            rustElementType:
                | "Heading"
                | "Paragraph"
                | "Table"
                | "Equation"
                | "Quote"
                | "Diagram"
                | "List"
                | "Enumeration"
                | "Figure",
        ) => {
            // The new element was inserted right after the empty current line;
            // drop that now-redundant empty block so the insert reads as a
            // replacement.
            if (replaceTargetId) {
                dispatch({
                    type: "REMOVE_ELEMENT",
                    payload: { elementId: replaceTargetId },
                });
            }
            setDocumentFocus({
                elementId: id,
                fieldId: defaultFieldIdForElement({
                    id,
                    type: rustElementType,
                }),
                caretUtf16Offset: 0,
                sourceRevision: null,
                anchorPageNumber: null,
                forcePreviewScroll: false,
                focusSource: "programmatic",
            });
        };

        if (elementType === "heading") {
            const level =
                options?.headingLevel ??
                parseHeadingInsertLevel(invocationPayload) ??
                1;
            dispatch({
                type: "ADD_HEADING",
                payload: {
                    sectionId,
                    headingId: id,
                    afterElementId,
                    level,
                },
            });
            finishInsert("Heading");
            return;
        }

        if (elementType === "paragraph") {
            dispatch({
                type: "ADD_PARAGRAPH",
                payload: { sectionId, paragraphId: id, afterElementId },
            });
            finishInsert("Paragraph");
            return;
        }

        if (elementType === "table") {
            dispatch({
                type: "ADD_TABLE",
                payload: { sectionId, tableId: id, afterElementId },
            });
            // Open the new table directly in fine-grained mode so the user can
            // type in the first cell immediately (consumed by the body editor
            // once the table reconciles into the doc).
            setPendingBlockEdit(id);
            finishInsert("Table");
            return;
        }

        if (elementType === "equation") {
            dispatch({
                type: "ADD_EQUATION",
                payload: {
                    sectionId,
                    equationId: id,
                    afterElementId,
                    syntax: defaultEquationSyntax,
                },
            });
            // Open the new equation in fine-grained mode so the caret lands in its
            // source field; otherwise the block stays node-selected and the first
            // keystroke replaces it.
            setPendingBlockEdit(id);
            finishInsert("Equation");
            return;
        }

        if (elementType === "inlineEquation") {
            if (insertInlineEquation(defaultEquationSyntax)) {
                return;
            }
            dispatch({
                type: "ADD_EQUATION",
                payload: {
                    sectionId,
                    equationId: id,
                    afterElementId,
                    syntax: defaultEquationSyntax,
                },
            });
            dispatch({
                type: "UPDATE_EQUATION",
                payload: { equationId: id, isBlock: false },
            });
            finishInsert("Equation");
            return;
        }

        if (elementType === "quote") {
            dispatch({
                type: "ADD_QUOTE",
                payload: { sectionId, quoteId: id, afterElementId },
            });
            finishInsert("Quote");
            return;
        }

        if (elementType === "diagram") {
            dispatch({
                type: "ADD_DIAGRAM",
                payload: { sectionId, diagramId: id, afterElementId },
            });
            finishInsert("Diagram");
            return;
        }

        if (elementType === "list") {
            dispatch({
                type: "ADD_LIST",
                payload: { sectionId, listId: id, afterElementId },
            });
            finishInsert("List");
            return;
        }

        if (elementType === "enumeration") {
            dispatch({
                type: "ADD_ENUMERATION",
                payload: { sectionId, enumerationId: id, afterElementId },
            });
            finishInsert("Enumeration");
            return;
        }

        dispatch({
            type: "ADD_FIGURE",
            payload: { sectionId, figureId: id, afterElementId },
        });
        finishInsert("Figure");
    }, [
        dispatch,
        focusStore,
        getState,
        ensureActiveProject,
        globalSettings.default_equation_syntax,
        insertInlineEquation,
        setDocumentFocus,
    ]);

    const exportDocument = useCallback(
        async (format: ExportFormat) => {
            try {
                const state = getState();
                if (format === "pdf") {
                    const path = await saveExportDialog(
                        "pdf",
                        1,
                        exportPdfFileNameFromProjectPath(currentProjectPath),
                    );
                    if (!path) {
                        return;
                    }
                    const bytes = await CompilerClient.exportPdf(state);
                    await TauriApi.writeBytesToPath(path, bytes);
                    return;
                }

                const pixelPerPt = 2;
                const pages =
                    format === "png"
                        ? await CompilerClient.exportPngPages(state, pixelPerPt)
                        : (await CompilerClient.exportSvgPages(state)).map((svg) =>
                              new TextEncoder().encode(svg),
                          );

                if (pages.length === 0) {
                    throw new Error("Document has no pages to export.");
                }

                const path = await saveExportDialog(format, pages.length);
                if (!path) {
                    return;
                }

                if (pages.length === 1) {
                    await TauriApi.writeBytesToPath(path, pages[0] ?? new Uint8Array());
                    return;
                }

                await TauriApi.writeZipExport(
                    path,
                    pages.map((bytes, index) => ({
                        name: pageExportFileName(format, index + 1),
                        bytes,
                    })),
                );
            } catch (error) {
                window.alert(
                    m.project_export_failed({
                        message:
                            error instanceof Error ? error.message : String(error),
                    }),
                );
            }
        },
        [currentProjectPath, getState],
    );

    const commandContext = useMemo<CommandContext>(
        () => ({
            hasActiveProject,
            focusedElementId,
        }),
        [focusedElementId, hasActiveProject],
    );

    const handleCloseProject = useCallback(async () => {
        await closeProject();
        setSettingsPanel(null);
        setCommandPaletteOpen(false);
        cancelNewProjectDialog();
    }, [cancelNewProjectDialog, closeProject]);

    const commands = useMemo<Command[]>(
        () => [
            ...workspaceCommands({
                showNewProjectDialog,
                openProject,
                saveProject,
                closeProject: handleCloseProject,
                recentProjectsRef,
                exportDocument,
            }),
            ...editorCommands({
                insertElement,
                applyRichTextMark,
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
            handleCloseProject,
            canRedo,
            canUndo,
            applyRichTextMark,
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
        getState,
        commandRegistry,
        commandContext,
        setDocumentFocus,
        insertElement,
        closeProject: handleCloseProject,
    });

    const isCommandEnabled = useCallback(
        (commandId: ActionId) => commandRegistry.enabled(commandId, commandContext),
        [commandRegistry, commandContext],
    );

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
                    isCommandEnabled={isCommandEnabled}
                />
                {hasActiveProject ? (
                    <ActionContextProvider id="workspace" contexts={["workspace"]}>
                        <Workspace
                            previewZoom={previewZoom}
                            previewZoomMode={previewZoomMode}
                            onPreviewZoomChange={setPreviewZoom}
                            onPreviewZoomModeChange={setPreviewZoomMode}
                            onExportDocument={exportDocument}
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
                        <CommandPalette
                            query={commandQuery}
                            onQueryChange={setCommandQuery}
                            commands={filteredCommands}
                            commandRegistry={commandRegistry}
                            commandContext={commandContext}
                            onRunCommand={runCommand}
                            onClose={() => runCommand("settings::Close")}
                        />
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
                            projectSettings={projectSettings}
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
                            templateDefaultOverrides={templateDefaultOverrides}
                            templateVariants={templateVariants}
                            templateVariantId={templateVariantId}
                            onTemplateVariantChange={(variantId) =>
                                dispatch({
                                    type: "UPDATE_TEMPLATE_VARIANT",
                                    payload: { variantId },
                                })
                            }
                            systemFonts={systemFonts}
                            t={t}
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
    useScrollRegionReveal();

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
