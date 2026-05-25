import { memo, useCallback, useMemo, useState } from "react";
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
import { projectInputFieldId } from "../../../editor/fieldIds";
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

    return (
        <ActionContextProvider
            id="editor"
            contexts={["editor"]}
            handlers={editorHandlers}
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

                {/* Render Content Sections */}
                {state.sections.map((section) =>
                    section.type === "Content" ? (
                        <ContentSectionEditor key={section.id} section={section} />
                    ) : null,
                )}
                </div>
            </main>
        </ActionContextProvider>
    );
};

interface DynamicFieldProps {
    schema: InputSchema;
    path: string;
    label?: string;
}

const getFieldLabel = (schema: InputSchema, label?: string) =>
    label || schema.label || schema.id || "";

const DynamicField = ({ schema, path, label }: DynamicFieldProps) => {
    if (schema.type === "array") {
        return <DynamicFieldArray schema={schema} path={path} label={label} />;
    }

    return <DynamicFieldString schema={schema} path={path} label={label} />;
};

const DynamicFieldString = ({ schema, path, label }: DynamicFieldProps) => {
    const { state, dispatch } = useDocumentAst();
    const fieldBinding = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: "project",
        fieldId: projectInputFieldId(path),
    });
    const value = getValueAtPath(state.inputs, path) ?? "";

    return (
        <Textarea
            {...fieldBinding}
            fullWidth
            label={getFieldLabel(schema, label)}
            importance={schema.importance ?? undefined}
            placeholder={schema.description ?? undefined}
            value={value}
            onChange={(event) =>
                dispatch({
                    type: "UPDATE_INPUT",
                    payload: { path, value: event.target.value },
                })
            }
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
        <div className={styles.section}>
            {section.elements.map((element) => (
                <ElementEditor key={element.id} element={element} />
            ))}
        </div>
    );
});
