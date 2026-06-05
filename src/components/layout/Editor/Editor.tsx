import {
    memo,
    useCallback,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import {
    useDocumentActions,
    useDocumentAstSelector,
    useDocumentAstStore,
    useDocumentFocusSelector,
    useDocumentFocusStore,
} from "../../../state/DocumentContext";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import { useTemplateTranslation } from "../../../hooks/useTemplateTranslation";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import {
    ActionContextProvider,
    useActionDispatcher,
    type ActionHandlerMap,
} from "../../../actions/runtime";
import { buildReferenceInsertAction } from "../../../editor/insertReference";
import { InsertReferenceDialog } from "../../organisms/InsertReferenceDialog/InsertReferenceDialog";
import type { TargetedOutlineEntry } from "../../../editor/outlineMatching";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import { ProseMirrorBodyEditor } from "../../organisms/ProseMirrorBodyEditor/ProseMirrorBodyEditor";
import { InputEntryAddButton } from "../../molecules/InputEntryControls/InputEntryAddButton";
import { InputEntryRemoveButton } from "../../molecules/InputEntryControls/InputEntryRemoveButton";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { EditorToolbar } from "../../organisms/EditorToolbar/EditorToolbar";
import { FindBar } from "../../organisms/FindBar/FindBar";
import { m } from "../../../paraglide/messages.js";
import entryStyles from "../../../styles/inputEntry.module.css";
import styles from "./Editor.module.css";
import type { InputSchema } from "../../../bindings/InputSchema";
import type { TemplateSpec } from "../../../bindings/TemplateSpec";
import {
    projectInputFieldId,
    simpleListComposerFieldId,
} from "../../../editor/fieldIds";
import { parseInputRichText } from "../../../editor/richTextMarks";
import {
    contentBlocksSignificantlyEqual,
    finalizeContentBlocks,
    normalizeContentBlocks,
    parseInputContentBlocks,
} from "../../../editor/contentBlocks";
import { useDeferredContentBlocksCommit } from "../../../editor/useDeferredContentBlocksCommit";
import { ParagraphsField } from "../../molecules/ParagraphsField/ParagraphsField";
import { parseSimpleListContentItems } from "../../../editor/simpleListContent";
import { normalizeEditableText, normalizeRichTextContent } from "../../../editor/textInput";
import { useDeferredRichTextCommit } from "../../../editor/useDeferredRichTextCommit";
import { RichTextField } from "../../molecules/RichTextField/RichTextField";
import { useDeferredTextCommit } from "../../../editor/useDeferredTextCommit";
import { SimpleListField } from "../../molecules/SimpleListField/SimpleListField";
import { AuthorsField } from "../../molecules/AuthorsField/AuthorsField";
import { EquationSyntaxField } from "../../molecules/EquationSyntaxField/EquationSyntaxField";
import type { EquationSyntax } from "../../../bindings/EquationSyntax";
import { CoverPageFieldContext } from "../../../actions/contexts/CoverPageFieldContext";
import {
    EditorNavigationProvider,
    useEditorNavigation,
} from "../../../editor/EditorNavigationContext";
import { useFieldNavigation } from "../../../editor/useFieldNavigation";
import { insertBodyReference } from "../../../editor/prosemirror/bodyInsert";
import { subscribeActiveTableCellSession } from "../../../editor/prosemirror/table/tableStructureBridge";
import {
    getActiveTextMarksSnapshot,
    subscribeActiveTextMarks,
} from "../../../editor/prosemirror/textMarkState";
import { isActiveTableCellEditing } from "../../../editor/prosemirror/table/tableCellInsertPolicy";
import { peekBodyTabModifiers } from "../../../editor/prosemirror/activeView";
import { createInputArrayItem } from "../../../editor/inputArrayEntry/createInputArrayItem";
import { InputArrayEntryProvider } from "../../../editor/inputArrayEntry/InputArrayEntryContext";
import { useInputArrayEntryContext } from "../../../editor/inputArrayEntry/InputArrayEntryContext";
import { fieldLabelImportance } from "../../../template/fieldImportance";

/** Shared stable empty array so selectors don't return a fresh `[]` each call. */
const EMPTY_ARRAY: readonly unknown[] = [];

/** Element-wise string-array equality so the section-id selector stays stable while typing. */
const stringArrayEquals = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((value, index) => value === b[index]);

const getValueAtPath = (obj: any, path: string): any => {
    const parts = path.split("/").filter(Boolean);
    let current = obj;
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (Array.isArray(current)) {
            const index = parseInt(part, 10);
            current = current[index];
        } else {
            current = current[part];
        }
    }
    return current;
};

const focusedAuthorIndex = (elementId: string | null, fieldId: string | null) => {
    if (
        (elementId !== "project" && elementId !== "inputs") ||
        !fieldId
    ) {
        return null;
    }

    const path = fieldId.startsWith("project-input-")
        ? fieldId.slice("project-input-".length)
        : fieldId;
    const match = path.match(/^\/authors\/(\d+)(?:\/|$)/);
    if (!match) {
        return null;
    }

    const index = Number(match[1]);
    return Number.isInteger(index) && index >= 0 ? index : null;
};

export interface EditorProps {
    resources: DocumentResources | null;
    outlineEntries: TargetedOutlineEntry[];
    resourcePreviewRevisions: ResourcePreviewRevisions;
    mainPreviewPaintedRevision: number | null;
    findBarOpen: boolean;
    onFindBarOpenChange: (open: boolean) => void;
}

const EditorComponent = ({
    resources,
    outlineEntries,
    resourcePreviewRevisions,
    mainPreviewPaintedRevision,
    findBarOpen,
    onFindBarOpenChange,
}: EditorProps) => {
    // Narrow subscriptions: the editor shell must not re-render on body typing.
    // `dispatchAst` is identity-stable; live AST/focus are read imperatively in
    // callbacks; only the render-affecting slices subscribe — and those
    // (focus identity, variant, references, section ids) stay stable while typing.
    const { dispatch: dispatchAst } = useDocumentActions();
    const astStore = useDocumentAstStore();
    const focusStore = useDocumentFocusStore();
    const focusElementId = useDocumentFocusSelector((focus) => focus.elementId);
    const focusFieldId = useDocumentFocusSelector((focus) => focus.fieldId);
    const templateVariantId = useDocumentAstSelector(
        (s) => s.metadata.template_variant_id,
    );
    const references = useDocumentAstSelector((s) => s.references);
    const contentSectionIds = useDocumentAstSelector(
        (s) =>
            s.sections
                .filter((section) => section.type === "Content")
                .map((section) => section.id),
        stringArrayEquals,
    );
    const dispatchAction = useActionDispatcher();
    const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);

    const applyReferenceInsert = useCallback(
        (pick: { referenceId: string; label: string }) => {
            if (insertBodyReference(pick.referenceId, pick.label)) {
                setReferenceDialogOpen(false);
                return;
            }

            const focus = focusStore.getSnapshot();
            const selection =
                focus.elementId && focus.fieldId
                    ? {
                          elementId: focus.elementId,
                          fieldId: focus.fieldId,
                      }
                    : null;
            if (!selection) {
                return;
            }

            const action = buildReferenceInsertAction(
                astStore.getSnapshot(),
                selection,
                pick,
                focus.caretUtf16Offset,
            );
            if (action) {
                dispatchAst(action);
            }
            setReferenceDialogOpen(false);
        },
        [astStore, dispatchAst, focusStore],
    );

    const getFocusedContentElement = useCallback(() => {
        const elementId = focusStore.getSnapshot().elementId;
        if (!elementId || elementId === "project" || elementId === "inputs") {
            return null;
        }
        const section = astStore
            .getSnapshot()
            .sections.find((entry) => entry.type === "Content");
        if (!section || section.type !== "Content") {
            return null;
        }
        return section.elements.find((entry) => entry.id === elementId) ?? null;
    }, [astStore, focusStore]);

    const editorHandlers = useMemo<ActionHandlerMap>(
        () => ({
            "editor::InsertReference": () => {
                setReferenceDialogOpen(true);
                return true;
            },
        }),
        [],
    );

    const { spec: templateSpec, variantId: activeVariantId } = useTemplateSpecContext();
    const t = useTemplateTranslation(templateSpec);
    const templateVariants = templateSpec?.editor?.variants ?? [];
    const resolvedVariantId =
        templateVariantId ??
        activeVariantId ??
        templateVariants.find((variant) => variant.default)?.id ??
        templateVariants[0]?.id ??
        "student";
    const groups = templateSpec?.editor?.groups || [];
    const inputsMap = useMemo(() => {
        return new Map<string, InputSchema>(
            (templateSpec?.editor?.inputs || []).map((input) => [input.id!, input])
        );
    }, [templateSpec?.editor?.inputs]);
    const fieldNavigation = useFieldNavigation(templateSpec, resolvedVariantId);
    const fieldNavigationRef = useRef(fieldNavigation);
    fieldNavigationRef.current = fieldNavigation;

    const deleteFocusedElement = useCallback(() => {
        const focus = focusStore.getSnapshot();
        const elementId = focus.elementId;
        const authorIndex = focusedAuthorIndex(elementId, focus.fieldId);
        if (authorIndex !== null) {
            dispatchAst({
                type: "REMOVE_INPUT_ARRAY_ITEM",
                payload: { path: "/authors", index: authorIndex },
            });
            return true;
        }

        if (!elementId || elementId === "project") {
            return false;
        }

        if (!window.confirm(m.element_delete_confirm())) {
            return false;
        }

        return fieldNavigationRef.current.removeContentElement(
            astStore.getSnapshot(),
            elementId,
        );
    }, [astStore, dispatchAst, focusStore]);

    const canDeleteFocusedTarget =
        Boolean(focusElementId && focusElementId !== "project") ||
        focusedAuthorIndex(focusElementId, focusFieldId) !== null;

    const tableCellEditing = useSyncExternalStore(
        subscribeActiveTableCellSession,
        isActiveTableCellEditing,
        () => false,
    );

    const activeTextMarks = useSyncExternalStore(
        subscribeActiveTextMarks,
        getActiveTextMarksSnapshot,
        () => ({ bold: false, italic: false, underline: false }),
    );

    const editorHandlersWithDelete = useMemo<ActionHandlerMap>(
        () => ({
            ...editorHandlers,
            "editor::Tab": () => {
                const tab = peekBodyTabModifiers();
                const mod = tab.ctrlKey || tab.metaKey;
                if (mod && tab.shiftKey) {
                    return fieldNavigationRef.current.focusLastFocusedTemplateField();
                }
                if (mod && !tab.shiftKey) {
                    return fieldNavigationRef.current.restoreLastBodyFocus();
                }
                return false;
            },
            "editor::DeleteElement": () => deleteFocusedElement(),
            "editor::AddTableRow": () => {
                const focused = getFocusedContentElement();
                if (focused?.type !== "Table") {
                    return false;
                }
                dispatchAst({
                    type: "ADD_TABLE_ROW",
                    payload: { tableId: focused.id },
                });
                return true;
            },
            "editor::AddTableColumn": () => {
                const focused = getFocusedContentElement();
                if (focused?.type !== "Table") {
                    return false;
                }
                dispatchAst({
                    type: "ADD_TABLE_COLUMN",
                    payload: { tableId: focused.id },
                });
                return true;
            },
            "editor::RemoveTableRow": (invocation) => {
                const focused = getFocusedContentElement();
                if (focused?.type !== "Table") {
                    return false;
                }
                const payload = invocation.payload;
                const rowIndex =
                    typeof payload === "object" &&
                    payload !== null &&
                    "rowIndex" in payload &&
                    typeof payload.rowIndex === "number"
                        ? payload.rowIndex
                        : focused.rows - 1;
                dispatchAst({
                    type: "REMOVE_TABLE_ROW",
                    payload: {
                        tableId: focused.id,
                        rowIndex,
                    },
                });
                return true;
            },
            "editor::RemoveTableColumn": (invocation) => {
                const focused = getFocusedContentElement();
                if (focused?.type !== "Table") {
                    return false;
                }
                const payload = invocation.payload;
                const colIndex =
                    typeof payload === "object" &&
                    payload !== null &&
                    "colIndex" in payload &&
                    typeof payload.colIndex === "number"
                        ? payload.colIndex
                        : focused.cols - 1;
                dispatchAst({
                    type: "REMOVE_TABLE_COLUMN",
                    payload: {
                        tableId: focused.id,
                        colIndex,
                    },
                });
                return true;
            },
        }),
        [
            deleteFocusedElement,
            dispatchAst,
            editorHandlers,
            getFocusedContentElement,
        ],
    );

    // Stable toolbar callbacks: `EditorToolbar` is memoized, so inline arrows
    // here would re-render it on every parent render (every compile). `dispatchAction`
    // is identity-stable, so this object is created once for the session.
    const toolbarHandlers = useMemo(
        () => ({
            onDelete: () =>
                void dispatchAction({ id: "editor::DeleteElement", payload: null }),
            onBold: () =>
                void dispatchAction({ id: "editor::Bold", payload: null }),
            onItalic: () =>
                void dispatchAction({ id: "editor::Italic", payload: null }),
            onUnderline: () =>
                void dispatchAction({ id: "editor::Underline", payload: null }),
            onInsertHeading: (level) =>
                void dispatchAction({
                    id: "editor::InsertHeading",
                    payload: { level },
                }),
            onInsertParagraph: () =>
                void dispatchAction({ id: "editor::InsertParagraph", payload: null }),
            onInsertQuote: () =>
                void dispatchAction({ id: "editor::InsertQuote", payload: null }),
            onInsertList: () =>
                void dispatchAction({ id: "editor::InsertList", payload: null }),
            onInsertEnumeration: () =>
                void dispatchAction({
                    id: "editor::InsertEnumeration",
                    payload: null,
                }),
            onInsertTable: () =>
                void dispatchAction({ id: "editor::InsertTable", payload: null }),
            onInsertBlockEquation: () =>
                void dispatchAction({
                    id: "editor::InsertBlockEquation",
                    payload: null,
                }),
            onInsertInlineEquation: () =>
                void dispatchAction({
                    id: "editor::InsertInlineEquation",
                    payload: null,
                }),
            onInsertFigure: () =>
                void dispatchAction({ id: "editor::InsertFigure", payload: null }),
            onInsertDiagram: () =>
                void dispatchAction({ id: "editor::InsertDiagram", payload: null }),
            onInsertReference: () =>
                void dispatchAction({ id: "editor::InsertReference", payload: null }),
        }),
        [dispatchAction],
    );

    return (
        <EditorNavigationProvider value={fieldNavigation}>
        <ActionContextProvider
            id="editor"
            contexts={["editor"]}
            handlers={editorHandlersWithDelete}
        >
            <main className={styles.editor}>
                <EditorToolbar
                    canDeleteFocusedTarget={canDeleteFocusedTarget}
                    activeTextMarks={activeTextMarks}
                    tableCellEditing={tableCellEditing}
                    {...toolbarHandlers}
                />
                <FindBar open={findBarOpen} onOpenChange={onFindBarOpenChange} />
                <InsertReferenceDialog
                    open={referenceDialogOpen}
                    resources={resources}
                    references={references}
                    outlineEntries={outlineEntries}
                    resourcePreviewRevisions={resourcePreviewRevisions}
                    mainPreviewPaintedRevision={mainPreviewPaintedRevision}
                    onClose={() => setReferenceDialogOpen(false)}
                    onSelect={applyReferenceInsert}
                />

                <div className={styles.editorScroll}>
                {groups.map((group) => (
                    <section key={group.id} className={styles.templateGroupCard}>
                        <h2>{t(group.label)}</h2>
                        <div className={styles.groupContent}>
                            {group.inputs.map((inputId) => {
                                const schema = inputsMap.get(inputId);
                                if (!schema) return null;
                                return (
                                    <DynamicField
                                        key={inputId}
                                        schema={schema}
                                        path={`/${inputId}`}
                                        label={schema.label ? t(schema.label) : undefined}
                                    />
                                );
                            })}
                        </div>
                    </section>
                ))}

                {contentSectionIds.map((sectionId, index) => (
                    <ProseMirrorBodyEditor
                        key={sectionId}
                        sectionId={sectionId}
                        autoFocus={index === 0}
                    />
                ))}
                </div>
            </main>
        </ActionContextProvider>
        </EditorNavigationProvider>
    );
};

// Memoized: Workspace re-renders on every keystroke (it drives the compiler off
// the live AST), but Editor's props change only per compile. Without memo, every
// keystroke re-rendered the whole form; now Editor skips between compiles and the
// edited field updates through its own `useDocumentAstSelector`.
export const Editor = memo(EditorComponent);

interface DynamicFieldProps {
    schema: InputSchema;
    path: string;
    label?: string;
}

const getFieldLabel = (schema: InputSchema, label?: string, t?: (key: string) => string) => {
    const raw = label || schema.label || schema.id || "";
    return t ? t(raw) : raw;
};

const getFieldPlaceholder = (schema: InputSchema, label?: string, t?: (key: string) => string) => {
    const description = schema.description?.trim();
    if (description) {
        return t ? t(description) : description;
    }
    return getFieldLabel(schema, label, t);
};

// Memoized: a body keystroke re-renders the top-level Editor, but the form
// fields' props (schema/path/label) are stable, so each field skips that
// cascade and re-renders only when its own input slice changes (via the
// per-field `useDocumentAstSelector`).
const DynamicField = memo(function DynamicField({
    schema,
    path,
    label,
}: DynamicFieldProps) {
    if (schema.type === "simple_list") {
        return <DynamicFieldSimpleList schema={schema} path={path} label={label} />;
    }

    if (schema.id === "authors" && schema.type === "array") {
        return <DynamicFieldAuthors schema={schema} path={path} label={label} />;
    }

    if (schema.type === "array") {
        return <DynamicFieldArray schema={schema} path={path} label={label} />;
    }

    if (schema.type === "object") {
        return <DynamicFieldObject schema={schema} path={path} label={label} />;
    }

    if (schema.type === "content") {
        return <DynamicFieldContent schema={schema} path={path} label={label} />;
    }

    if (schema.type === "content_blocks") {
        return <DynamicFieldContentBlocks schema={schema} path={path} label={label} />;
    }

    if (schema.type === "equation") {
        return <DynamicFieldEquation schema={schema} path={path} label={label} />;
    }

    return <DynamicFieldString schema={schema} path={path} label={label} />;
});

const DynamicFieldSimpleList = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const { dispatch } = useDocumentActions();
    const { handleFieldAdvance } = useEditorNavigation();
    const rawItems = useDocumentAstSelector((s) => getValueAtPath(s.inputs, path));
    const itemKind =
        schema.items?.type === "content" ? "content" : "string";

    if (itemKind === "content") {
        const items = parseSimpleListContentItems(rawItems);

        return (
            <SimpleListField
                importance={fieldLabelImportance(schema.importance)}
                itemKind="content"
                items={items}
                label={getFieldLabel(schema, label, t)}
                path={path}
                onAdvance={() => handleFieldAdvance(simpleListComposerFieldId(path))}
                onChange={(nextItems) =>
                    dispatch({
                        type: "UPDATE_INPUT",
                        payload: { path, value: nextItems },
                    })
                }
            />
        );
    }

    const items = (rawItems ?? []) as string[];

    return (
        <SimpleListField
            importance={fieldLabelImportance(schema.importance)}
            itemKind="string"
            items={items.map(String)}
            label={getFieldLabel(schema, label, t)}
            path={path}
            onAdvance={() => handleFieldAdvance(simpleListComposerFieldId(path))}
            onChange={(nextItems) =>
                dispatch({
                    type: "UPDATE_INPUT",
                    payload: { path, value: nextItems },
                })
            }
        />
    );
};

const templateInputSchema = (
    spec: TemplateSpec | null,
    inputId: string,
): InputSchema | undefined => spec?.editor?.inputs?.find((input) => input.id === inputId);

const authorItemProperty = (
    authorSchema: InputSchema,
    propertyId: string,
): InputSchema | undefined =>
    authorSchema.items?.properties?.find((property) => property.id === propertyId);

const authorReferenceGroupLabel = (
    spec: TemplateSpec | null,
    authorSchema: InputSchema,
    propertyId: "affiliations" | "titles",
    targetInputId: string,
    t: (key: string) => string,
    fallback: string,
): string => {
    const targetSchema = templateInputSchema(spec, targetInputId);
    if (targetSchema) {
        return getFieldLabel(targetSchema, undefined, t);
    }

    const propertySchema = authorSchema.items?.properties?.find(
        (property) => property.id === propertyId,
    );
    if (propertySchema) {
        return getFieldLabel(propertySchema, undefined, t);
    }

    return fallback;
};

const DynamicFieldAuthors = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const templateId = useDocumentAstSelector((s) => s.metadata.template_id);
    const authors = (useDocumentAstSelector((s) => getValueAtPath(s.inputs, path)) ??
        []) as Array<{
        name?: string;
        affiliations?: string[];
        titles?: string[];
    }>;
    const affiliations = useDocumentAstSelector((s) =>
        getValueAtPath(s.inputs, "/affiliations"),
    );
    const titles = useDocumentAstSelector((s) =>
        getValueAtPath(s.inputs, "/titles"),
    );
    const referenceStyle =
        templateId === "umb-apa" ? "lowercase-alpha" : "numeric";
    const nameProperty = authorItemProperty(schema, "name");

    return (
        <CoverPageFieldContext fieldId={path}>
        <AuthorsField
            affiliations={Array.isArray(affiliations) ? affiliations : []}
            affiliationsLabel={authorReferenceGroupLabel(
                spec,
                schema,
                "affiliations",
                "affiliations",
                t,
                m.editor_affiliations(),
            )}
            authors={authors}
            titles={Array.isArray(titles) ? titles : []}
            titlesLabel={authorReferenceGroupLabel(
                spec,
                schema,
                "titles",
                "titles",
                t,
                m.editor_degrees(),
            )}
            importance={fieldLabelImportance(schema.importance)}
            label={getFieldLabel(schema, label, t)}
            nameImportance={fieldLabelImportance(nameProperty?.importance)}
            nameLabel={
                nameProperty ? getFieldLabel(nameProperty, undefined, t) : ""
            }
            namePlaceholder={
                nameProperty
                    ? getFieldPlaceholder(nameProperty, undefined, t)
                    : ""
            }
            referenceStyle={referenceStyle}
        />
        </CoverPageFieldContext>
    );
};

const DynamicFieldContent = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const { dispatch } = useDocumentActions();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const rawValue = useDocumentAstSelector((s) => getValueAtPath(s.inputs, path));
    const committed = parseInputRichText(rawValue);
    const { content, setDraft, shouldCommit } = useDeferredRichTextCommit(
        projectInputFieldId(path),
        committed,
    );
    const fieldId = projectInputFieldId(path);
    const fieldBinding = useEditorFieldBinding<HTMLDivElement>({
        elementId: "project",
        fieldId,
    });

    return (
        <RichTextField
            label={getFieldLabel(schema, label, t)}
            importance={fieldLabelImportance(schema.importance)}
            content={content}
            fieldBinding={fieldBinding}
            onChange={(next) => {
                const normalized = normalizeRichTextContent(next);
                setDraft(normalized);
                if (shouldCommit(normalized)) {
                    dispatch({
                        type: "UPDATE_INPUT",
                        payload: { path, value: normalized },
                    });
                }
            }}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
            }}
        />
    );
};

const DynamicFieldContentBlocks = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const { dispatch } = useDocumentActions();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const rawValue = useDocumentAstSelector((s) => getValueAtPath(s.inputs, path));
    const committed = parseInputContentBlocks(rawValue);
    const { content, setDraft, shouldCommit } = useDeferredContentBlocksCommit(
        projectInputFieldId(path),
        committed,
    );
    const fieldId = projectInputFieldId(path);
    const fieldBinding = useEditorFieldBinding<HTMLDivElement>({
        elementId: "project",
        fieldId,
    });

    return (
        <ParagraphsField
            label={getFieldLabel(schema, label, t)}
            importance={fieldLabelImportance(schema.importance)}
            paragraphs={content}
            fieldBinding={fieldBinding}
            onChange={(next) => {
                setDraft(next);
                const normalized = normalizeContentBlocks(next);
                if (shouldCommit(normalized)) {
                    dispatch({
                        type: "UPDATE_INPUT",
                        payload: { path, value: finalizeContentBlocks(normalized) },
                    });
                }
            }}
            onBlur={() => {
                const normalized = normalizeContentBlocks(content);
                const finalized = finalizeContentBlocks(normalized);
                if (
                    !contentBlocksSignificantlyEqual(
                        finalized,
                        finalizeContentBlocks(committed),
                    )
                ) {
                    dispatch({
                        type: "UPDATE_INPUT",
                        payload: { path, value: finalized },
                    });
                }
            }}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
            }}
        />
    );
};

type InputEquationValue = { syntax: EquationSyntax; source: string };

const parseInputEquationValue = (raw: unknown): InputEquationValue => {
    if (raw !== null && typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        return {
            syntax: record.syntax === "latex" ? "latex" : "typst",
            source: typeof record.source === "string" ? record.source : "",
        };
    }
    return { syntax: "typst", source: "" };
};

const DynamicFieldEquation = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const { dispatch } = useDocumentActions();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const rawValue = useDocumentAstSelector((s) => getValueAtPath(s.inputs, path));
    const committed = parseInputEquationValue(rawValue);
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committed.source);
    const fieldId = projectInputFieldId(path);
    const fieldBinding = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: "project",
        fieldId,
    });

    const updateEquation = (next: InputEquationValue) => {
        dispatch({
            type: "UPDATE_INPUT",
            payload: { path, value: next },
        });
    };

    return (
        <div className={entryStyles.card}>
            <EquationSyntaxField
                value={committed.syntax}
                onChange={(syntax) =>
                    updateEquation({
                        syntax,
                        source: committed.source,
                    })
                }
            />
            <Textarea
                {...fieldBinding}
                fullWidth
                label={getFieldLabel(schema, label, t)}
                importance={fieldLabelImportance(schema.importance)}
                placeholder={getFieldPlaceholder(schema, label, t)}
                value={draft}
                onChange={(event) => {
                    const next = normalizeEditableText(event.target.value);
                    setDraft(next);
                    if (shouldCommit(next)) {
                        updateEquation({
                            syntax: committed.syntax,
                            source: next,
                        });
                    }
                }}
                onBlur={() => {
                    const normalized = normalizeEditableText(draft);
                    if (normalized !== committed.source) {
                        updateEquation({
                            syntax: committed.syntax,
                            source: normalized,
                        });
                    }
                }}
                onKeyDown={(event) => {
                    if (handleAdvanceKeyDown(event, fieldId)) {
                        return;
                    }
                }}
            />
        </div>
    );
};

const DynamicFieldString = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const { dispatch } = useDocumentActions();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const arrayEntry = useInputArrayEntryContext();
    const rawValue = useDocumentAstSelector((s) => getValueAtPath(s.inputs, path));
    const committed = String(rawValue ?? "");
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(committed);
    const fieldId = projectInputFieldId(path);
    const fieldBinding = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: "project",
        fieldId,
    });

    return (
        <Textarea
            {...fieldBinding}
            fullWidth
            label={getFieldLabel(schema, label, t)}
            importance={fieldLabelImportance(schema.importance)}
            placeholder={getFieldPlaceholder(schema, label, t)}
            value={draft}
            onChange={(event) => {
                const next = normalizeEditableText(event.target.value);
                setDraft(next);
                if (shouldCommit(next)) {
                    dispatch({
                        type: "UPDATE_INPUT",
                        payload: { path, value: next },
                    });
                }
            }}
            onKeyDown={(event) => {
                if (
                    arrayEntry &&
                    event.key === "Enter" &&
                    !event.ctrlKey &&
                    !event.metaKey &&
                    !event.shiftKey
                ) {
                    event.preventDefault();
                    const normalized = normalizeEditableText(draft);
                    if (normalized !== committed) {
                        dispatch({
                            type: "UPDATE_INPUT",
                            payload: { path, value: normalized },
                        });
                    }
                    arrayEntry.insertBelow();
                    return;
                }
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
            }}
        />
    );
};

const DynamicFieldObject = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const sectionLabel = getFieldLabel(schema, label, t);

    return (
        <div className={entryStyles.section}>
            {sectionLabel ? (
                <FieldLabel importance={fieldLabelImportance(schema.importance)}>
                    {sectionLabel}
                </FieldLabel>
            ) : null}
            <div className={entryStyles.card}>
                {(schema.properties ?? []).map((prop) => {
                    const propPath = `${path}/${prop.id}`;
                    return (
                        <DynamicField
                            key={prop.id}
                            schema={prop}
                            path={propPath}
                            label={prop.label ?? undefined}
                        />
                    );
                })}
            </div>
        </div>
    );
};


const normalizeReferenceTargetPath = (target: string) =>
    target.startsWith("/") ? target : `/${target}`;

const referenceValueForTargetItem = (item: unknown, index: number): string => {
    if (
        item !== null &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "string"
    ) {
        return item.id;
    }
    return String(index + 1);
};

const referenceLabelForTargetItem = (item: unknown, index: number): string => {
    if (typeof item === "string" && item.trim()) {
        return item;
    }
    if (item !== null && typeof item === "object") {
        const record = item as Record<string, unknown>;
        for (const key of ["name", "institution", "title", "label", "id"]) {
            const value = record[key];
            if (typeof value === "string" && value.trim()) {
                return value;
            }
        }
    }
    return m.editor_reference_fallback({ index: index + 1 });
};

const ReferenceArrayField = ({
    schema,
    path,
    selectedReferences = [],
}: {
    schema: InputSchema;
    path: string;
    selectedReferences: string[];
}) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const { dispatch } = useDocumentActions();
    const targetPath = schema.items?.target
        ? normalizeReferenceTargetPath(schema.items.target)
        : null;
    const targetItems = useDocumentAstSelector((s) =>
        targetPath ? getValueAtPath(s.inputs, targetPath) : EMPTY_ARRAY,
    );
    const fieldLabel = getFieldLabel(schema, undefined, t);

    const handleToggleReference = (referenceValue: string, checked: boolean) => {
        const nextReferences = checked
            ? [...selectedReferences, referenceValue]
            : selectedReferences.filter((ref) => ref !== referenceValue);

        dispatch({
            type: "UPDATE_INPUT",
            payload: {
                path,
                value: nextReferences,
            },
        });
    };

    if (!Array.isArray(targetItems) || targetItems.length === 0) {
        return (
            <div className={styles.referenceSelector}>
                <span className={styles.label}>{fieldLabel}</span>
                <p className={styles.empty}>
                    {m.editor_reference_empty({ label: fieldLabel })}
                </p>
            </div>
        );
    }

    return (
        <div className={styles.referenceSelector}>
            <span className={styles.label}>{fieldLabel}</span>
            <div className={styles.checkboxGroup}>
                {targetItems.map((item: unknown, index: number) => {
                    const referenceValue = referenceValueForTargetItem(item, index);
                    const displayName = referenceLabelForTargetItem(item, index);
                    const isChecked = selectedReferences.includes(referenceValue);
                    const selectedIndex = selectedReferences.indexOf(referenceValue);
                    const selectedPath =
                        selectedIndex >= 0 ? `${path}/${selectedIndex}` : path;

                    return (
                        <ReferenceCheckbox
                            key={referenceValue}
                            checked={isChecked}
                            fieldPath={selectedPath}
                            label={displayName}
                            onChange={(checked) =>
                                handleToggleReference(referenceValue, checked)
                            }
                        />
                    );
                })}
            </div>
        </div>
    );
};

const ReferenceCheckbox = ({
    checked,
    fieldPath,
    label,
    onChange,
}: {
    checked: boolean;
    fieldPath: string;
    label: string;
    onChange: (checked: boolean) => void;
}) => {
    const fieldBinding = useEditorFieldBinding<HTMLInputElement>({
        elementId: "project",
        fieldId: projectInputFieldId(fieldPath),
    });

    return (
        <Checkbox
            {...fieldBinding}
            className={styles.checkboxLabel}
            label={label}
            checked={checked}
            onChange={(event) => onChange(event.target.checked)}
        />
    );
};

const DynamicFieldArray = ({ schema, path, label }: DynamicFieldProps) => {
    const { spec } = useTemplateSpecContext();
    const t = useTemplateTranslation(spec);
    const { dispatch } = useDocumentActions();
    const items =
        useDocumentAstSelector((s) => getValueAtPath(s.inputs, path)) ?? EMPTY_ARRAY;

    if (schema.items?.type === "reference" && schema.items.target) {
        return (
            <ReferenceArrayField
                schema={schema}
                path={path}
                selectedReferences={Array.isArray(items) ? items.map(String) : []}
            />
        );
    }

    const handleAddItem = () => {
        dispatch({
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path,
                index: items.length,
                value: createInputArrayItem(schema.items, items.length),
            },
        });
    };

    const handleRemoveItem = (index: number) => {
        dispatch({
            type: "REMOVE_INPUT_ARRAY_ITEM",
            payload: { path, index },
        });
    };

    return (
        <div className={entryStyles.section}>
            <FieldLabel importance={fieldLabelImportance(schema.importance)}>
                {getFieldLabel(schema, label, t)}
            </FieldLabel>
            {items.length > 0 ? (
                <div className={entryStyles.list}>
                    {items.map((item: any, index: number) => {
                        const itemPath = `${path}/${index}`;
                        return (
                            <InputArrayEntryProvider
                                key={index}
                                arrayPath={path}
                                existingLength={items.length}
                                itemIndex={index}
                                itemSchema={schema.items}
                            >
                            <div
                                className={`${entryStyles.card} ${entryStyles.cardWithRemove}`}
                            >
                                <InputEntryRemoveButton
                                    onClick={() => handleRemoveItem(index)}
                                />
                                {schema.items?.type === "object" &&
                                    schema.items.properties ? (
                                        schema.items.properties.map((prop) => {
                                            const propPath = `${itemPath}/${prop.id}`;
                                            if (
                                                prop.id === "id" &&
                                                prop.type === "integer"
                                            ) {
                                                return (
                                                    <div
                                                        key={prop.id}
                                                        className={styles.badge}
                                                    >
                                                        ID: {item.id}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <DynamicField
                                                    key={prop.id}
                                                    schema={prop}
                                                    path={propPath}
                                                    label={prop.label ?? undefined}
                                                />
                                            );
                                        })
                                    ) : (
                                        <DynamicField
                                            schema={schema.items!}
                                            path={itemPath}
                                        />
                                    )}
                            </div>
                            </InputArrayEntryProvider>
                        );
                    })}
                </div>
            ) : null}
            <InputEntryAddButton
                label={label || schema.label || m.editor_array_item()}
                onClick={handleAddItem}
            />
        </div>
    );
};

