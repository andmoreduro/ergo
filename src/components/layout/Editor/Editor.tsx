import { memo, useCallback, useMemo, useRef, useState } from "react";
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
import { FieldLabel } from "../../atoms/FieldLabel/FieldLabel";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { m } from "../../../paraglide/messages.js";
import toolbarStyles from "../PanelToolbar.module.css";
import styles from "./Editor.module.css";
import type { InputSchema } from "../../../bindings/InputSchema";
import {
    projectInputFieldId,
    simpleListComposerFieldId,
} from "../../../editor/fieldIds";
import { normalizeEditableText } from "../../../editor/textInput";
import { useDeferredTextCommit } from "../../../editor/useDeferredTextCommit";
import { SimpleListField } from "../../molecules/SimpleListField/SimpleListField";
import { AuthorsField } from "../../molecules/AuthorsField/AuthorsField";
import {
    EditorNavigationProvider,
    useEditorNavigation,
} from "../../../editor/EditorNavigationContext";
import { useFieldNavigation } from "../../../editor/useFieldNavigation";
import { Delete24Regular } from "@fluentui/react-icons";
import {
    TextHeader124Regular,
    Table24Regular,
    MathFormula24Regular,
    Image24Regular,
    Link24Regular,
} from "@fluentui/react-icons";
import { TextParagraph24Regular } from "../../icons/TextParagraph24Regular";
import { Accordion } from "../../molecules/Accordion/Accordion";

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
        if (!elementId || elementId === "project") {
            return false;
        }

        if (!window.confirm(m.element_delete_confirm())) {
            return false;
        }

        return fieldNavigationRef.current.removeContentElement(state, elementId);
    }, [documentFocus.elementId, state]);

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
                <header className={toolbarStyles.toolbar}>
                    <button
                        className={toolbarStyles.toolbarButton}
                        type="button"
                        title={m.menubar_insert_heading()}
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::InsertHeading",
                                payload: null,
                            })
                        }
                    >
                        <TextHeader124Regular />
                    </button>
                    <button
                        className={toolbarStyles.toolbarButton}
                        type="button"
                        title={m.menubar_insert_paragraph()}
                        aria-label={m.menubar_insert_paragraph()}
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::InsertParagraph",
                                payload: null,
                            })
                        }
                    >
                        <TextParagraph24Regular aria-hidden />
                    </button>
                    <button
                        className={toolbarStyles.toolbarButton}
                        type="button"
                        title={m.menubar_insert_table()}
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::InsertTable",
                                payload: null,
                            })
                        }
                    >
                        <Table24Regular />
                    </button>
                    <button
                        className={toolbarStyles.toolbarButton}
                        type="button"
                        title={m.menubar_insert_equation()}
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::InsertEquation",
                                payload: null,
                            })
                        }
                    >
                        <MathFormula24Regular />
                    </button>
                    <button
                        className={toolbarStyles.toolbarButton}
                        type="button"
                        title={m.menubar_insert_figure()}
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::InsertFigure",
                                payload: null,
                            })
                        }
                    >
                        <Image24Regular />
                    </button>
                    <button
                        className={toolbarStyles.toolbarButton}
                        type="button"
                        title={m.menubar_insert_reference()}
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::InsertReference",
                                payload: null,
                            })
                        }
                    >
                        <Link24Regular />
                    </button>
                    <span className={toolbarStyles.toolbarSpacer} />
                    <button
                        className={toolbarStyles.toolbarButton}
                        type="button"
                        title={m.element_delete()}
                        aria-label={m.element_delete()}
                        disabled={
                            !documentFocus.elementId ||
                            documentFocus.elementId === "project"
                        }
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::DeleteElement",
                                payload: null,
                            })
                        }
                    >
                        <Delete24Regular />
                    </button>
                    {templateVariants.length > 1 && (
                        <>
                            <span className={toolbarStyles.toolbarSpacer} />
                            <label
                                className={styles.variantToolbarLabel}
                                htmlFor="template-variant"
                            >
                                {m.settings_template_variant()}
                            </label>
                            <select
                                id="template-variant"
                                className={styles.variantToolbarSelect}
                                value={resolvedVariantId}
                                title={m.settings_template_variant()}
                                onChange={(event) =>
                                    dispatchAst({
                                        type: "UPDATE_TEMPLATE_VARIANT",
                                        payload: { variantId: event.target.value },
                                    })
                                }
                            >
                                {templateVariants.map((variant) => (
                                    <option key={variant.id} value={variant.id}>
                                        {variant.label}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                </header>
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
                    <Accordion key={group.id} title={group.label} defaultOpen>
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
                    </Accordion>
                ))}

                {groups.length > 0 ? (
                    <div
                        aria-hidden
                        className={styles.templateContentDivider}
                        role="separator"
                    />
                ) : null}

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
    if (schema.id === "affiliations" && schema.type === "simple_list") {
        return <DynamicFieldAffiliations schema={schema} path={path} label={label} />;
    }

    if (schema.type === "simple_list") {
        return <DynamicFieldSimpleList schema={schema} path={path} label={label} />;
    }

    if (schema.id === "authors" && schema.type === "array") {
        return <DynamicFieldAuthors schema={schema} path={path} label={label} />;
    }

    if (schema.type === "array") {
        return <DynamicFieldArray schema={schema} path={path} label={label} />;
    }

    return <DynamicFieldString schema={schema} path={path} label={label} />;
};

const DynamicFieldAffiliations = ({ schema, path, label }: DynamicFieldProps) => {
    const { state, dispatch } = useDocumentAst();
    const { handleFieldAdvance } = useEditorNavigation();
    const items = (getValueAtPath(state.inputs, path) ?? []) as string[];

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

const DynamicFieldSimpleList = ({ schema, path, label }: DynamicFieldProps) => {
    const { state, dispatch } = useDocumentAst();
    const { handleFieldAdvance, handleAdvanceKeyDown } = useEditorNavigation();
    const items = (getValueAtPath(state.inputs, path) ?? []) as string[];
    const itemKind =
        schema.items?.type === "content" ? "content" : "string";

    return (
        <SimpleListField
            importance={schema.importance ?? undefined}
            itemKind={itemKind}
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
    const affiliations = (getValueAtPath(state.inputs, "/affiliations") ??
        []) as string[];

    return (
        <AuthorsField
            affiliations={affiliations}
            authors={authors}
            importance={schema.importance ?? undefined}
            label={getFieldLabel(schema, label)}
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
        <label className={styles.checkboxLabel}>
            <input
                {...fieldBinding}
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span>{label}</span>
        </label>
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
    return (
        <div className={styles.contentSection}>
            {section.elements.map((element) => (
                <ElementEditor key={element.id} element={element} />
            ))}
        </div>
    );
});
