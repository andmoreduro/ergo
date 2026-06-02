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
import type { TemplateOverride } from "./bindings/TemplateOverride";
import type { TemplateVariantSpec } from "./bindings/TemplateVariantSpec";
import {
    createEnumeration,
    createEquation,
    createId,
    createList,
    createParagraph,
    createQuote,
} from "./state/ast/defaults";
import {
    buildInsertInTableCellAction,
    getTableCellEditContext,
} from "./editor/prosemirror/table/tableCellInsert";
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
import type { Command, CommandContext } from "./commands/types";
import { workspaceCommands } from "./commands/workspaceCommands";
import { TauriApi } from "./api/tauri";
import type { EquationSyntax } from "./bindings/EquationSyntax";
import type { ExportFormat } from "./bindings/ExportFormat";
import type { RichText } from "./bindings/RichText";
import { pageExportFileName, saveExportDialog } from "./platform/export";
import { CompilerClient, warmupCompiler } from "./workers/compilerClient";
import { editorCommands, type ElementType } from "./commands/editorCommands";
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
    const [templateVariants, setTemplateVariants] = useState<TemplateVariantSpec[]>([]);
    const [templateDefaultOverrides, setTemplateDefaultOverrides] = useState<
        TemplateOverride[]
    >([]);
    const [previewZoom, setPreviewZoom] = useState(PREVIEW_ZOOM_DEFAULT);
    const [previewZoomMode, setPreviewZoomMode] =
        useState<PreviewZoomMode>("manual");
    const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
    const [commandQuery, setCommandQuery] = useState("");
    const dispatchAction = useActionDispatcher();
    const recentProjects = globalSettings.recent_projects;

    useEffect(() => {
        if (!hasActiveProject) {
            setTemplateVariants([]);
            setTemplateDefaultOverrides([]);
            return;
        }

        let cancelled = false;
        void TauriApi.getTemplateSpec(state.metadata.template_id).then((spec) => {
            if (!cancelled) {
                setTemplateVariants(spec.variants);
                setTemplateDefaultOverrides(spec.default_template_overrides ?? []);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [hasActiveProject, state.metadata.template_id]);
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

        const elementId = documentFocus.elementId;
        const fieldId = documentFocus.fieldId;
        if (!elementId || !fieldId) {
            return false;
        }

        const contentSection = state.sections.find(
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
                documentFocus.caretUtf16Offset ?? richTextPlainLength(content),
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
    }, [
        dispatch,
        documentFocus.caretUtf16Offset,
        documentFocus.elementId,
        documentFocus.fieldId,
        state.sections,
    ]);

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
            applyRichTextMarkToFocusedField(mark, documentFocus.fieldId);
        },
        [documentFocus.fieldId],
    );

    const insertElement = useCallback((elementType: ElementType) => {
        const contentSection = state.sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            return;
        }

        ensureActiveProject();

        const defaultEquationSyntax: EquationSyntax =
            globalSettings.default_equation_syntax ?? "typst";

        const tableCellCtx = getTableCellEditContext(
            state,
            documentFocus.elementId,
            documentFocus.fieldId,
        );
        if (
            tableCellCtx &&
            elementType !== "table" &&
            elementType !== "heading" &&
            elementType !== "figure" &&
            elementType !== "diagram"
        ) {
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
        }

        const sectionId = contentSection.id;
        const id = elementType === "diagram" ? `diagram-${createId()}` : createId();
        const afterElementId =
            documentFocus.elementId &&
            documentFocus.elementId !== "project"
            && documentFocus.elementId !== "inputs"
                ? documentFocus.elementId
                : undefined;

        // If the caret sits on an empty text line, the inserted element replaces
        // it rather than stacking after it. We only treat empty paragraphs,
        // headings, and quotes as "empty lines" — block objects, tables, and
        // lists are not lines and are always inserted after.
        const replaceTarget =
            afterElementId === undefined
                ? undefined
                : contentSection.elements.find(
                      (element) => element.id === afterElementId,
                  );
        const replaceTargetId =
            replaceTarget &&
            (replaceTarget.type === "Paragraph" ||
                replaceTarget.type === "Heading" ||
                replaceTarget.type === "Quote") &&
            richTextPlainLength(replaceTarget.content) === 0
                ? replaceTarget.id
                : null;

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
            dispatch({
                type: "ADD_HEADING",
                payload: { sectionId, headingId: id, afterElementId },
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
        documentFocus.elementId,
        documentFocus.fieldId,
        ensureActiveProject,
        globalSettings.default_equation_syntax,
        insertInlineEquation,
        setDocumentFocus,
        state,
        state.sections,
    ]);

    const exportDocument = useCallback(
        async (format: ExportFormat) => {
            try {
                if (format === "pdf") {
                    const path = await saveExportDialog("pdf");
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
        [state],
    );

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
            closeProject,
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
                            templateDefaultOverrides={templateDefaultOverrides}
                            templateVariants={templateVariants}
                            templateVariantId={state.metadata.template_variant_id}
                            onTemplateVariantChange={(variantId) =>
                                dispatch({
                                    type: "UPDATE_TEMPLATE_VARIANT",
                                    payload: { variantId },
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
