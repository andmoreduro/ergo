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
import {
    buildReferenceInsertAction,
    parseReferenceInsertPayload,
} from "../../../editor/insertReference";
import { InsertReferenceDialog } from "../../organisms/InsertReferenceDialog/InsertReferenceDialog";
import type { TargetedOutlineEntry } from "../../../editor/outlineMatching";
import type { ResourcePreviewRevisions } from "../../../hooks/useCompiler";
import { ProseMirrorBodyEditor } from "../../organisms/ProseMirrorBodyEditor/ProseMirrorBodyEditor";
import { Button } from "../../atoms/Button/Button";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { EditorToolbar } from "../../organisms/EditorToolbar/EditorToolbar";
import { m } from "../../../paraglide/messages.js";
import styles from "./Editor.module.css";
import type { InputSchema } from "../../../bindings/InputSchema";
import {
    projectInputFieldId,
    simpleListComposerFieldId,
} from "../../../editor/fieldIds";
import { parseInputRichText } from "../../../editor/richTextMarks";
import {
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
import {
    EditorNavigationProvider,
    useEditorNavigation,
} from "../../../editor/EditorNavigationContext";
import { useFieldNavigation } from "../../../editor/useFieldNavigation";
import { insertBodyReference } from "../../../editor/prosemirror/bodyInsert";
import { subscribeActiveTableCellSession } from "../../../editor/prosemirror/table/tableStructureBridge";
import { isActiveTableCellEditing } from "../../../editor/prosemirror/table/tableCellInsertPolicy";
import { peekBodyTabModifiers } from "../../../editor/prosemirror/activeView";

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
}

const EditorComponent = ({
    resources,
    outlineEntries,
    resourcePreviewRevisions,
    mainPreviewPaintedRevision,
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
            "resources::InsertReference": (invocation) => {
                const target = parseReferenceInsertPayload(invocation.payload);
                if (!target) {
                    return false;
                }
                applyReferenceInsert(target);
                return true;
            },
        }),
        [applyReferenceInsert],
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
            onInsertHeading: () =>
                void dispatchAction({ id: "editor::InsertHeading", payload: null }),
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
                    tableCellEditing={tableCellEditing}
                    {...toolbarHandlers}
                />
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
                importance={schema.importance ?? undefined}
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
            importance={schema.importance ?? undefined}
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

const DynamicFieldAuthors = ({ schema, path, label }: DynamicFieldProps) => {
    const templateId = useDocumentAstSelector((s) => s.metadata.template_id);
    const authors = (useDocumentAstSelector((s) => getValueAtPath(s.inputs, path)) ??
        []) as Array<{
        name?: string;
        affiliations?: string[];
        degrees?: string[];
    }>;
    const affiliations = useDocumentAstSelector((s) =>
        getValueAtPath(s.inputs, "/affiliations"),
    );
    const degrees = useDocumentAstSelector((s) =>
        getValueAtPath(s.inputs, "/degrees"),
    );
    const referenceStyle =
        templateId === "umb-apa" ? "lowercase-alpha" : "numeric";

    return (
        <AuthorsField
            affiliations={Array.isArray(affiliations) ? affiliations : []}
            authors={authors}
            degrees={Array.isArray(degrees) ? degrees : []}
            importance={schema.importance ?? undefined}
            label={getFieldLabel(schema, label)}
            referenceStyle={referenceStyle}
        />
    );
};

const DynamicFieldContent = ({ schema, path, label }: DynamicFieldProps) => {
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
            label={getFieldLabel(schema, label)}
            importance={schema.importance ?? undefined}
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
            label={getFieldLabel(schema, label)}
            importance={schema.importance ?? undefined}
            paragraphs={content}
            fieldBinding={fieldBinding}
            onChange={(next) => {
                const normalized = normalizeContentBlocks(next);
                setDraft(normalized);
                if (shouldCommit(normalized)) {
                    dispatch({
                        type: "UPDATE_INPUT",
                        payload: { path, value: finalizeContentBlocks(normalized) },
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

const DynamicFieldString = ({ schema, path, label }: DynamicFieldProps) => {
    const { dispatch } = useDocumentActions();
    const { handleAdvanceKeyDown } = useEditorNavigation();
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
            label={getFieldLabel(schema, label)}
            importance={schema.importance ?? undefined}
            placeholder={getFieldPlaceholder(schema, label)}
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
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
            }}
        />
    );
};

const DynamicFieldObject = ({ schema, path, label }: DynamicFieldProps) => {
    return (
        <div className={styles.objectContainer}>
            {getFieldLabel(schema, label) && (
                <div className={styles.objectHeader}>
                    <FieldLabel importance={schema.importance ?? undefined}>
                        {getFieldLabel(schema, label)}
                    </FieldLabel>
                </div>
            )}
            <div className={styles.objectContent}>
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
    const { dispatch } = useDocumentActions();
    const targetPath = schema.items?.target
        ? normalizeReferenceTargetPath(schema.items.target)
        : null;
    const targetItems = useDocumentAstSelector((s) =>
        targetPath ? getValueAtPath(s.inputs, targetPath) : EMPTY_ARRAY,
    );
    const fieldLabel = getFieldLabel(schema);

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
        let insertedValue: any;
        if (schema.items?.type === "object" && schema.items.properties) {
            const newItem: Record<string, any> = {};
            for (const prop of schema.items.properties) {
                if (prop.type === "integer" && prop.id === "id") {
                    newItem[prop.id] = items.length + 1;
                } else if (prop.type === "array") {
                    newItem[prop.id!] = [];
                } else {
                    newItem[prop.id!] = prop.default ?? "";
                }
            }
            insertedValue = newItem;
        } else {
            insertedValue = schema.items?.default ?? "";
        }

        dispatch({
            type: "INSERT_INPUT_ARRAY_ITEM",
            payload: {
                path,
                index: items.length,
                value: insertedValue,
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
        <div className={styles.arrayContainer}>
            <div className={styles.arrayHeader}>
                <FieldLabel importance={schema.importance ?? undefined}>
                    {getFieldLabel(schema, label)}
                </FieldLabel>
            </div>
            <div className={styles.arrayList}>
                {items.map((item: any, index: number) => {
                    const itemPath = `${path}/${index}`;
                    return (
                        <div key={index} className={styles.arrayItemRow}>
                            <div className={styles.arrayItemContent}>
                                {schema.items?.type === "object" && schema.items.properties ? (
                                    schema.items.properties.map((prop) => {
                                        const propPath = `${itemPath}/${prop.id}`;
                                        if (prop.id === "id" && prop.type === "integer") {
                                            return (
                                                <div key={prop.id} className={styles.badge}>
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
                            <Button
                                type="button"
                                variant="danger"
                                size="small"
                                onClick={() => handleRemoveItem(index)}
                            >
                                {m.editor_remove_item()}
                            </Button>
                        </div>
                    );
                })}
            </div>
            <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={handleAddItem}
            >
                {m.editor_add_item({
                    label: label || schema.label || m.editor_array_item(),
                })}
            </Button>
        </div>
    );
};

