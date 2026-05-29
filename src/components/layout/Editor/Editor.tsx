import {
    memo,
    useCallback,
    useMemo,
    useRef,
    useState,
    type MouseEventHandler,
} from "react";
import type { DocumentResources } from "../../../bindings/DocumentResources";
import { useDocument, useDocumentAst } from "../../../state/DocumentContext";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import type { DocumentSection } from "../../../bindings/DocumentSection";
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
import type { TargetedOutlineEntry } from "../Sidebar/SidebarOutline";
import { ElementEditor } from "../../organisms/ElementEditor/ElementEditor";
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
import {
    focusClosestContentField,
    isContentSectionFocusDelegationTarget,
} from "../../../editor/contentSectionFocus";
type ContentSection = Extract<DocumentSection, { type: "Content" }>;

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
}

export const Editor = ({ resources, outlineEntries }: EditorProps) => {
    const { state, dispatch: dispatchAst } = useDocumentAst();
    const { documentFocus, dispatch } = useDocument();
    const dispatchAction = useActionDispatcher();
    const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);

    const applyReferenceInsert = useCallback(
        (pick: { referenceId: string; label: string }) => {
            const selection =
                documentFocus.elementId && documentFocus.fieldId
                    ? {
                          elementId: documentFocus.elementId,
                          fieldId: documentFocus.fieldId,
                      }
                    : null;
            if (!selection) {
                return;
            }

            const action = buildReferenceInsertAction(
                state,
                selection,
                pick,
                documentFocus.caretUtf16Offset,
            );
            if (action) {
                dispatch(action);
            }
            setReferenceDialogOpen(false);
        },
        [
            dispatch,
            documentFocus.caretUtf16Offset,
            documentFocus.elementId,
            documentFocus.fieldId,
            state,
        ],
    );

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
    const templateVariants = templateSpec?.variants ?? [];
    const resolvedVariantId =
        state.metadata.template_variant_id ??
        activeVariantId ??
        templateVariants.find((variant) => variant.default)?.id ??
        templateVariants[0]?.id ??
        "student";
    const groups = templateSpec?.groups || [];
    const inputsMap = useMemo(() => {
        return new Map<string, InputSchema>(
            (templateSpec?.inputs || []).map((input) => [input.id!, input])
        );
    }, [templateSpec?.inputs]);
    const fieldNavigation = useFieldNavigation(templateSpec, resolvedVariantId);
    const fieldNavigationRef = useRef(fieldNavigation);
    fieldNavigationRef.current = fieldNavigation;

    const deleteFocusedElement = useCallback(() => {
        const elementId = documentFocus.elementId;
        const authorIndex = focusedAuthorIndex(elementId, documentFocus.fieldId);
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

        return fieldNavigationRef.current.removeContentElement(state, elementId);
    }, [dispatchAst, documentFocus.elementId, documentFocus.fieldId, state]);

    const canDeleteFocusedTarget =
        Boolean(documentFocus.elementId && documentFocus.elementId !== "project") ||
        focusedAuthorIndex(documentFocus.elementId, documentFocus.fieldId) !== null;

    const editorHandlersWithDelete = useMemo<ActionHandlerMap>(
        () => ({
            ...editorHandlers,
            "editor::DeleteElement": () => deleteFocusedElement(),
        }),
        [deleteFocusedElement, editorHandlers],
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
                    templateVariants={templateVariants}
                    resolvedVariantId={resolvedVariantId}
                    onDelete={() =>
                        void dispatchAction({
                            id: "editor::DeleteElement",
                            payload: null,
                        })
                    }
                    onBold={() =>
                        void dispatchAction({ id: "editor::Bold", payload: null })
                    }
                    onItalic={() =>
                        void dispatchAction({ id: "editor::Italic", payload: null })
                    }
                    onUnderline={() =>
                        void dispatchAction({
                            id: "editor::Underline",
                            payload: null,
                        })
                    }
                    onInsertHeading={() =>
                        void dispatchAction({
                            id: "editor::InsertHeading",
                            payload: null,
                        })
                    }
                    onInsertParagraph={() =>
                        void dispatchAction({
                            id: "editor::InsertParagraph",
                            payload: null,
                        })
                    }
                    onInsertQuote={() =>
                        void dispatchAction({
                            id: "editor::InsertQuote",
                            payload: null,
                        })
                    }
                    onInsertList={() =>
                        void dispatchAction({
                            id: "editor::InsertList",
                            payload: null,
                        })
                    }
                    onInsertEnumeration={() =>
                        void dispatchAction({
                            id: "editor::InsertEnumeration",
                            payload: null,
                        })
                    }
                    onInsertTable={() =>
                        void dispatchAction({
                            id: "editor::InsertTable",
                            payload: null,
                        })
                    }
                    onInsertBlockEquation={() =>
                        void dispatchAction({
                            id: "editor::InsertBlockEquation",
                            payload: null,
                        })
                    }
                    onInsertInlineEquation={() =>
                        void dispatchAction({
                            id: "editor::InsertInlineEquation",
                            payload: null,
                        })
                    }
                    onInsertFigure={() =>
                        void dispatchAction({
                            id: "editor::InsertFigure",
                            payload: null,
                        })
                    }
                    onInsertDiagram={() =>
                        void dispatchAction({
                            id: "editor::InsertDiagram",
                            payload: null,
                        })
                    }
                    onInsertReference={() =>
                        void dispatchAction({
                            id: "editor::InsertReference",
                            payload: null,
                        })
                    }
                    onVariantChange={(variantId) =>
                        dispatchAst({
                            type: "UPDATE_TEMPLATE_VARIANT",
                            payload: { variantId },
                        })
                    }
                />
                <InsertReferenceDialog
                    open={referenceDialogOpen}
                    resources={resources}
                    references={state.references}
                    outlineEntries={outlineEntries}
                    onClose={() => setReferenceDialogOpen(false)}
                    onSelect={applyReferenceInsert}
                />

                <div className={styles.editorScroll} data-scroll-region>
                {groups.map((group) => (
                    <section key={group.id} className={styles.templateGroupCard}>
                        <h2>{group.label}</h2>
                        <div className={styles.groupContent}>
                            {group.inputs.map((inputId) => {
                                const schema = inputsMap.get(inputId);
                                if (!schema) return null;
                                return (
                                    <DynamicField
                                        key={inputId}
                                        schema={schema}
                                        path={`/${inputId}`}
                                        label={schema.label ?? undefined}
                                    />
                                );
                            })}
                        </div>
                    </section>
                ))}

                {state.sections.map((section) =>
                    section.type === "Content" ? (
                        <ContentSectionEditor key={section.id} section={section} />
                    ) : null,
                )}
                </div>
            </main>
        </ActionContextProvider>
        </EditorNavigationProvider>
    );
};

interface DynamicFieldProps {
    schema: InputSchema;
    path: string;
    label?: string;
}

const getFieldLabel = (schema: InputSchema, label?: string) =>
    label || schema.label || schema.id || "";

const getFieldPlaceholder = (schema: InputSchema, label?: string) => {
    const description = schema.description?.trim();
    if (description) {
        return description;
    }
    return getFieldLabel(schema, label);
};

const DynamicField = ({ schema, path, label }: DynamicFieldProps) => {
    if (schema.type === "simple_list") {
        return <DynamicFieldSimpleList schema={schema} path={path} label={label} />;
    }

    if (schema.id === "authors" && schema.type === "array") {
        return <DynamicFieldAuthors schema={schema} path={path} label={label} />;
    }

    if (schema.type === "array") {
        return <DynamicFieldArray schema={schema} path={path} label={label} />;
    }

    if (schema.type === "content") {
        return <DynamicFieldContent schema={schema} path={path} label={label} />;
    }

    return <DynamicFieldString schema={schema} path={path} label={label} />;
};

const DynamicFieldSimpleList = ({ schema, path, label }: DynamicFieldProps) => {
    const { state, dispatch } = useDocumentAst();
    const { handleFieldAdvance } = useEditorNavigation();
    const rawItems = getValueAtPath(state.inputs, path);
    const itemKind =
        schema.items?.type === "content" ? "content" : "string";

    if (itemKind === "content") {
        const items = parseSimpleListContentItems(rawItems);

        return (
            <SimpleListField
                importance={schema.importance ?? undefined}
                itemKind="content"
                items={items}
                label={getFieldLabel(schema, label)}
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
            label={getFieldLabel(schema, label)}
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
    const { state } = useDocumentAst();
    const authors = (getValueAtPath(state.inputs, path) ?? []) as Array<{
        name?: string;
        affiliations?: string[];
    }>;
    const affiliations = getValueAtPath(state.inputs, "/affiliations");

    return (
        <AuthorsField
            affiliations={Array.isArray(affiliations) ? affiliations : []}
            authors={authors}
            importance={schema.importance ?? undefined}
            label={getFieldLabel(schema, label)}
        />
    );
};

const DynamicFieldContent = ({ schema, path, label }: DynamicFieldProps) => {
    const { state, dispatch } = useDocumentAst();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const committed = parseInputRichText(getValueAtPath(state.inputs, path));
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

const DynamicFieldString = ({ schema, path, label }: DynamicFieldProps) => {
    const { state, dispatch } = useDocumentAst();
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const committed = String(getValueAtPath(state.inputs, path) ?? "");
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
    const { state, dispatch } = useDocumentAst();
    const targetPath = schema.items?.target
        ? normalizeReferenceTargetPath(schema.items.target)
        : null;
    const targetItems = targetPath ? getValueAtPath(state.inputs, targetPath) : [];
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
    const { state, dispatch } = useDocumentAst();
    const items = getValueAtPath(state.inputs, path) ?? [];

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

const ContentSectionEditor = memo(function ContentSectionEditor({ section }: { section: ContentSection }) {
    const handleContentSectionPointerDown = useCallback<
        MouseEventHandler<HTMLDivElement>
    >(
        (event) => {
            if (event.button !== 0) {
                return;
            }

            const target = event.target;
            if (!isContentSectionFocusDelegationTarget(target)) {
                return;
            }

            const focused = focusClosestContentField(
                event.currentTarget,
                target,
                event.clientX,
                event.clientY,
            );
            if (focused) {
                event.preventDefault();
            }
        },
        [],
    );

    return (
        <div
            className={styles.contentSection}
            data-content-section
            onPointerDown={handleContentSectionPointerDown}
        >
            {section.elements.map((element) => (
                <ElementEditor key={element.id} element={element} />
            ))}
        </div>
    );
});
