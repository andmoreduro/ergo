import { useMemo } from "react";
import { useDocumentAst } from "../../../state/DocumentContext";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import type { DocumentSection } from "../../../bindings/DocumentSection";
import {
    ActionContextProvider,
    useActionDispatcher,
} from "../../../actions/runtime";
import { ElementEditor } from "../../organisms/ElementEditor/ElementEditor";
import { Button } from "../../atoms/Button/Button";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { m } from "../../../paraglide/messages.js";
import styles from "./Editor.module.css";
import type { InputSchema } from "../../../bindings/InputSchema";
import { projectInputFieldId } from "../../../editor/fieldIds";
import {
    TextHeader124Regular,
    TextParagraph24Regular,
    Table24Regular,
    MathFormula24Regular,
    Image24Regular,
} from "@fluentui/react-icons";
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

export const Editor = () => {
    const { state } = useDocumentAst();
    const dispatchAction = useActionDispatcher();

    const { spec: templateSpec } = useTemplateSpecContext();
    const groups = templateSpec?.groups || [];
    const inputsMap = useMemo(() => {
        return new Map<string, InputSchema>(
            (templateSpec?.inputs || []).map((input) => [input.id!, input])
        );
    }, [templateSpec?.inputs]);

    return (
        <ActionContextProvider id="editor" contexts={["editor"]}>
            <main className={styles.editor}>
                {/* Insert Toolbar at the top with Fluent Icons */}
                <div className={styles.toolbar}>
                    <button
                        className={styles.toolbarButton}
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
                        className={styles.toolbarButton}
                        type="button"
                        title={m.menubar_insert_paragraph()}
                        onClick={() =>
                            void dispatchAction({
                                id: "editor::InsertParagraph",
                                payload: null,
                            })
                        }
                    >
                        <TextParagraph24Regular />
                    </button>
                    <button
                        className={styles.toolbarButton}
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
                        className={styles.toolbarButton}
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
                        className={styles.toolbarButton}
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
                </div>

                {/* Render input groups dynamically */}
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
            </main>
        </ActionContextProvider>
    );
};

interface DynamicFieldProps {
    schema: InputSchema;
    path: string;
    label?: string;
}

const getFieldLabel = (schema: InputSchema, label?: string) => {
    const baseLabel = label || schema.label || schema.id || "";
    if (!schema.importance) return baseLabel;
    return `${baseLabel} (${schema.importance})`;
};

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


const AuthorAffiliationsSelector = ({
    authorPath,
    authorAffiliations = [],
}: {
    authorPath: string;
    authorAffiliations: string[];
}) => {
    const { state, dispatch } = useDocumentAst();
    const allAffiliations = state.inputs.affiliations || [];

    const handleToggleAffiliation = (affRef: string, checked: boolean) => {
        const nextAffiliations = checked
            ? [...authorAffiliations, affRef]
            : authorAffiliations.filter((ref) => ref !== affRef);

        dispatch({
            type: "UPDATE_INPUT",
            payload: {
                path: `${authorPath}/affiliations`,
                value: nextAffiliations,
            },
        });
    };

    if (!Array.isArray(allAffiliations) || allAffiliations.length === 0) {
        return (
            <div className={styles.affiliationsSelector}>
                <span className={styles.label}>Affiliations</span>
                <p className={styles.empty}>No affiliations defined yet. Add some in the Affiliations section below.</p>
            </div>
        );
    }

    return (
        <div className={styles.affiliationsSelector}>
            <span className={styles.label}>Affiliations</span>
            <div className={styles.checkboxGroup}>
                {allAffiliations.map((aff: any, index: number) => {
                    const affRef = String(index + 1);
                    const displayName = typeof aff === "string" ? aff : (aff.name || aff.institution || `Affiliation #${affRef}`);
                    const isChecked = authorAffiliations.includes(affRef);
                    const selectedIndex = authorAffiliations.indexOf(affRef);
                    const selectedPath = selectedIndex >= 0
                        ? `${authorPath}/affiliations/${selectedIndex}`
                        : `${authorPath}/affiliations`;

                    return (
                        <AuthorAffiliationCheckbox
                            key={affRef}
                            checked={isChecked}
                            fieldPath={selectedPath}
                            label={displayName}
                            onChange={(checked) =>
                                handleToggleAffiliation(affRef, checked)
                            }
                        />
                    );
                })}
            </div>
        </div>
    );
};

const AuthorAffiliationCheckbox = ({
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
                <h4>{getFieldLabel(schema, label)}</h4>
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
                                        if (path.endsWith("authors") && prop.id === "affiliations") {
                                            return (
                                                <AuthorAffiliationsSelector
                                                    key={prop.id}
                                                    authorPath={itemPath}
                                                    authorAffiliations={item.affiliations || []}
                                                />
                                            );
                                        }

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
                                Remove
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
                Add {label || schema.label || "Item"}
            </Button>
        </div>
    );
};

const ContentSectionEditor = ({ section }: { section: ContentSection }) => {
    return (
        <div className={styles.section}>
            {section.elements.map((element) => (
                <ElementEditor key={element.id} element={element} />
            ))}
        </div>
    );
};
