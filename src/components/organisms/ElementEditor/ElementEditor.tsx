import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useMemo } from "react";
import { TauriApi } from "../../../api/tauri";
import { useDocumentAst } from "../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import {
    ActionContextProvider,
    useActionDispatcher,
    type ActionHandlerMap,
} from "../../../actions/runtime";
import {
    equationSourceFieldId,
    figureBodyFieldId,
    figureCaptionFieldId,
    figurePlacementFieldId,
    richTextFieldId,
    tableCellFieldId,
    tableColumnSizeFieldId,
    elementExtraFieldFieldId,
} from "../../../editor/fieldIds";
import { useTemplateSpecContext } from "../../../state/TemplateSpecContext";
import { Button } from "../../atoms/Button/Button";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Select } from "../../atoms/Select/Select";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import styles from "./ElementEditor.module.css";

export interface ElementEditorProps {
    element: DocumentElement;
}

type HeadingElement = Extract<DocumentElement, { type: "Heading" }>;
type ParagraphElement = Extract<DocumentElement, { type: "Paragraph" }>;
type EquationElement = Extract<DocumentElement, { type: "Equation" }>;
type TableElement = Extract<DocumentElement, { type: "Table" }>;
type FigureElement = Extract<DocumentElement, { type: "Figure" }>;
type CustomElementUnion = Extract<DocumentElement, { type: "Custom" }>;
type RichTextElement = HeadingElement | ParagraphElement;

const richTextToString = (element: RichTextElement) =>
    element.content.map((richText) => richText.text).join("");

const headingLevels = Array.from({ length: 5 }, (_, index) => {
    const level = String(index + 1);
    return { value: level, label: level };
});

const getPlacementOptions = () => [
    { value: "auto", label: m.placement_auto() },
    { value: "top", label: m.placement_top() },
    { value: "bottom", label: m.placement_bottom() },
];

const elementLabel = (element: DocumentElement): string => {
    if (element.type === "Heading") {
        return m.sidebar_heading({ level: element.level });
    }

    if (element.type === "Paragraph") {
        return m.sidebar_paragraph();
    }

    if (element.type === "Table") {
        return m.sidebar_table();
    }

    if (element.type === "Equation") {
        return m.sidebar_equation();
    }

    return m.sidebar_figure();
};

export const ElementEditor = ({ element }: ElementEditorProps) => {
    const { dispatch } = useDocumentAst();
    const dispatchAction = useActionDispatcher();
    const tableRows = element.type === "Table" ? element.rows : 0;
    const tableCols = element.type === "Table" ? element.cols : 0;

    const handleDelete = useCallback(() => {
        if (window.confirm(m.element_delete_confirm())) {
            dispatch({ type: "REMOVE_ELEMENT", payload: { elementId: element.id } });
        }
    }, [dispatch, element.id]);

    const elementHandlers: ActionHandlerMap = useMemo(
        () => ({
            "editor::DeleteElement": () => {
                handleDelete();
                return true;
            },
            "editor::AddTableRow": () => {
                if (element.type !== "Table") {
                    return false;
                }

                dispatch({
                    type: "ADD_TABLE_ROW",
                    payload: { tableId: element.id },
                });
                return true;
            },
            "editor::AddTableColumn": () => {
                if (element.type !== "Table") {
                    return false;
                }

                dispatch({
                    type: "ADD_TABLE_COLUMN",
                    payload: { tableId: element.id },
                });
                return true;
            },
            "editor::RemoveTableRow": (invocation) => {
                if (element.type !== "Table") {
                    return false;
                }

                const payload = invocation.payload;
                const rowIndex =
                    typeof payload === "object" &&
                    payload !== null &&
                    "rowIndex" in payload &&
                    typeof payload.rowIndex === "number"
                        ? payload.rowIndex
                        : tableRows - 1;

                dispatch({
                    type: "REMOVE_TABLE_ROW",
                    payload: {
                        tableId: element.id,
                        rowIndex,
                    },
                });
                return true;
            },
            "editor::RemoveTableColumn": (invocation) => {
                if (element.type !== "Table") {
                    return false;
                }

                const payload = invocation.payload;
                const colIndex =
                    typeof payload === "object" &&
                    payload !== null &&
                    "colIndex" in payload &&
                    typeof payload.colIndex === "number"
                        ? payload.colIndex
                        : tableCols - 1;

                dispatch({
                    type: "REMOVE_TABLE_COLUMN",
                    payload: {
                        tableId: element.id,
                        colIndex,
                    },
                });
                return true;
            },
        }),
        [dispatch, element.id, element.type, handleDelete, tableCols, tableRows],
    );

    return (
        <ActionContextProvider
            id={`element-${element.id}`}
            contexts={["element"]}
            attributes={{
                "element.id": element.id,
                "element.kind": element.type,
            }}
            handlers={elementHandlers}
        >
            <div className={styles.container} data-element-id={element.id}>
                <div className={styles.header}>
                    <span className={styles.title}>{elementLabel(element)}</span>
                    <div className={styles.actions}>
                        <Button
                            variant="danger"
                            size="small"
                            type="button"
                            onClick={() =>
                                dispatchAction({
                                    id: "editor::DeleteElement",
                                    payload: null,
                                })
                            }
                        >
                            {m.element_delete()}
                        </Button>
                    </div>
                </div>
                <div className={styles.content}>
                    <ElementContent element={element} />
                </div>
            </div>
        </ActionContextProvider>
    );
};

const ElementContent = ({ element }: { element: DocumentElement }) => {
    if (element.type === "Heading") {
        return <HeadingEditor element={element} />;
    }

    if (element.type === "Paragraph") {
        return <ParagraphEditor element={element} />;
    }

    if (element.type === "Equation") {
        return <EquationEditor element={element} />;
    }

    if (element.type === "Table") {
        return <TableEditor element={element} />;
    }

    if (element.type === "Custom") {
        return <CustomElementEditor element={element} />;
    }

    if (element.type === "Figure") {
        return <FigureEditor element={element} />;
    }

    return null;
};

const CustomElementEditor = ({ element }: { element: CustomElementUnion }) => {
    const { dispatch } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const customElements = templateSpec?.custom_elements || [];
    const spec = customElements.find((c) => c.kind === element.element_type);

    if (!spec) {
        return <div className={styles.placeholder}>Unknown custom element type: {element.element_type}</div>;
    }

    return (
        <>
            {(spec.fields || []).map((field) => {
                const value = element.fields[field.key] ?? "";
                return (
                    <Textarea
                        key={field.key}
                        fullWidth
                        label={field.label || field.key}
                        value={value}
                        onChange={(event) =>
                            dispatch({
                                type: "UPDATE_CUSTOM_ELEMENT_FIELD",
                                payload: {
                                    elementId: element.id,
                                    field: field.key,
                                    value: event.target.value,
                                },
                            })
                        }
                    />
                );
            })}
        </>
    );
};

const HeadingEditor = ({ element }: { element: HeadingElement }) => {
    const { dispatch } = useDocumentAst();
    const textField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId: richTextFieldId(element.id),
    });

    return (
        <>
            <Select
                fullWidth
                label={m.editor_heading_level()}
                value={String(element.level)}
                options={headingLevels}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_HEADING",
                        payload: {
                            headingId: element.id,
                            level: Number(event.target.value),
                        },
                    })
                }
            />
            <Textarea
                {...textField}
                fullWidth
                value={richTextToString(element)}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_HEADING",
                        payload: {
                            headingId: element.id,
                            text: event.target.value,
                        },
                    })
                }
            />
        </>
    );
};

const ParagraphEditor = ({ element }: { element: ParagraphElement }) => {
    const { dispatch } = useDocumentAst();
    const textField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId: richTextFieldId(element.id),
    });

    return (
        <Textarea
            {...textField}
            fullWidth
            value={richTextToString(element)}
            onChange={(event) =>
                dispatch({
                    type: "UPDATE_PARAGRAPH_TEXT",
                    payload: {
                        paragraphId: element.id,
                        text: event.target.value,
                    },
                })
            }
        />
    );
};

const EquationEditor = ({ element }: { element: EquationElement }) => {
    const { dispatch } = useDocumentAst();
    const sourceField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId: equationSourceFieldId(element.id),
    });

    return (
        <>
            <Textarea
                {...sourceField}
                fullWidth
                label={m.editor_equation_source()}
                value={element.latex_source}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_EQUATION",
                        payload: {
                            equationId: element.id,
                            latexSource: event.target.value,
                        },
                    })
                }
            />
            <Checkbox
                label={m.editor_equation_block()}
                checked={element.is_block}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_EQUATION",
                        payload: {
                            equationId: element.id,
                            isBlock: event.target.checked,
                        },
                    })
                }
            />
        </>
    );
};

const TableEditor = ({ element }: { element: TableElement }) => {
    const dispatchAction = useActionDispatcher();
    const { dispatch } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const extraFields = templateSpec?.element_overrides?.table?.extra_fields ?? [];

    return (
        <>
            <div className={styles.columnSizes}>
                {element.column_sizes.map((size, colIndex) => (
                    <TableColumnSizeEditor
                        colIndex={colIndex}
                        element={element}
                        key={colIndex}
                        size={size}
                    />
                ))}
            </div>
            <div className={styles.tableGrid}>
                {element.cells.map((row, rowIndex) => (
                    <div className={styles.tableRow} key={`row-${rowIndex}`}>
                        {row.map((cell, colIndex) => (
                            <TableCellEditor
                                cellContent={cell.content}
                                colIndex={colIndex}
                                element={element}
                                key={`cell-${rowIndex}-${colIndex}`}
                                rowIndex={rowIndex}
                            />
                        ))}
                        <Button
                            type="button"
                            variant="ghost"
                            size="small"
                            disabled={element.rows <= 1}
                            onClick={() =>
                                dispatchAction({
                                    id: "editor::RemoveTableRow",
                                    payload: { rowIndex },
                                })
                            }
                        >
                            {m.editor_table_remove_row()}
                        </Button>
                    </div>
                ))}
            </div>
            <div className={styles.tableActions}>
                <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::AddTableRow",
                            payload: null,
                        })
                    }
                >
                    {m.editor_table_add_row()}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() =>
                        dispatchAction({
                            id: "editor::AddTableColumn",
                            payload: null,
                        })
                    }
                >
                    {m.editor_table_add_column()}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="small"
                    disabled={element.cols <= 1}
                    onClick={() =>
                        dispatchAction({
                            id: "editor::RemoveTableColumn",
                            payload: { colIndex: element.cols - 1 },
                        })
                    }
                >
                    {m.editor_table_remove_column()}
                </Button>
            </div>
            {extraFields.map((field) => (
                <ExtraFieldInput
                    key={field.key}
                    elementId={element.id}
                    fieldKey={field.key}
                    label={field.label}
                    value={element.extra_fields?.[field.key] ?? ""}
                    onChange={(value) =>
                        dispatch({
                            type: "UPDATE_ELEMENT_EXTRA_FIELD",
                            payload: {
                                elementId: element.id,
                                fieldKey: field.key,
                                fieldValue: value,
                            },
                        })
                    }
                />
            ))}
        </>
    );
};

const TableColumnSizeEditor = ({
    colIndex,
    element,
    size,
}: {
    colIndex: number;
    element: TableElement;
    size: string;
}) => {
    const { dispatch } = useDocumentAst();
    const columnField = useEditorFieldBinding<HTMLInputElement>({
        elementId: element.id,
        fieldId: tableColumnSizeFieldId(element.id, colIndex),
    });

    return (
        <TextInput
            {...columnField}
            label={m.editor_table_column_size({
                index: colIndex + 1,
            })}
            value={size}
            onChange={(event) =>
                dispatch({
                    type: "UPDATE_TABLE_COLUMN_SIZE",
                    payload: {
                        tableId: element.id,
                        colIndex,
                        size: event.target.value,
                    },
                })
            }
        />
    );
};

const TableCellEditor = ({
    cellContent,
    colIndex,
    element,
    rowIndex,
}: {
    cellContent: string;
    colIndex: number;
    element: TableElement;
    rowIndex: number;
}) => {
    const { dispatch } = useDocumentAst();
    const cellField = useEditorFieldBinding<HTMLInputElement>({
        elementId: element.id,
        fieldId: tableCellFieldId(element.id, rowIndex, colIndex),
    });

    return (
        <TextInput
            {...cellField}
            value={cellContent}
            aria-label={m.editor_table_cell_label({
                row: rowIndex + 1,
                column: colIndex + 1,
            })}
            onChange={(event) =>
                dispatch({
                    type: "UPDATE_TABLE_CELL",
                    payload: {
                        tableId: element.id,
                        rowIndex,
                        colIndex,
                        text: event.target.value,
                    },
                })
            }
        />
    );
};

const FigureEditor = ({ element }: { element: FigureElement }) => {
    const { state, dispatch } = useDocumentAst();
    const { spec: templateSpec } = useTemplateSpecContext();
    const extraFields = templateSpec?.element_overrides?.figure?.extra_fields ?? [];
    const linkedAsset = element.asset_id
        ? state.assets.find((asset) => asset.id === element.asset_id)
        : null;

    const chooseImage = async () => {
        const selected = await open({
            multiple: false,
            directory: false,
            filters: [
                {
                    name: "Images",
                    extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"],
                },
            ],
        });
        if (typeof selected !== "string") {
            return;
        }

        const asset = await TauriApi.importResourceFile(selected);
        const existing = state.assets.some((entry) => entry.id === asset.id);
        if (!existing) {
            dispatch({ type: "ADD_ASSET", payload: { asset } });
        }
        dispatch({
            type: "UPDATE_FIGURE",
            payload: {
                figureId: element.id,
                assetId: asset.id,
            },
        });
    };

    const bodyText =
        element.content.type === "Paragraph" ? richTextToString(element.content) : "";
    const bodyField = useEditorFieldBinding<HTMLTextAreaElement>({
        elementId: element.id,
        fieldId: figureBodyFieldId(element.id),
    });
    const captionField = useEditorFieldBinding<HTMLInputElement>({
        elementId: element.id,
        fieldId: figureCaptionFieldId(element.id),
    });
    const placementField = useEditorFieldBinding<HTMLSelectElement>({
        elementId: element.id,
        fieldId: figurePlacementFieldId(element.id),
    });

    return (
        <>
            <div className={styles.figureAssetRow}>
                <Button
                    size="small"
                    type="button"
                    variant="secondary"
                    onClick={() => {
                        void chooseImage();
                    }}
                >
                    {m.editor_figure_choose_image()}
                </Button>
                {linkedAsset && (
                    <span className={styles.figureAssetPath}>{linkedAsset.path}</span>
                )}
            </div>
            <Textarea
                {...bodyField}
                fullWidth
                label={m.editor_figure_body()}
                value={bodyText}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_FIGURE",
                        payload: {
                            figureId: element.id,
                            bodyText: event.target.value,
                        },
                    })
                }
            />
            <TextInput
                {...captionField}
                fullWidth
                label={m.editor_figure_caption()}
                value={element.caption}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_FIGURE",
                        payload: {
                            figureId: element.id,
                            caption: event.target.value,
                        },
                    })
                }
            />
            <Select
                {...placementField}
                fullWidth
                label={m.editor_figure_placement()}
                value={element.placement}
                options={getPlacementOptions()}
                onChange={(event) =>
                    dispatch({
                        type: "UPDATE_FIGURE",
                        payload: {
                            figureId: element.id,
                            placement: event.target.value,
                        },
                    })
                }
            />
            {extraFields.map((field) => (
                <ExtraFieldInput
                    key={field.key}
                    elementId={element.id}
                    fieldKey={field.key}
                    label={field.label}
                    value={element.extra_fields?.[field.key] ?? ""}
                    onChange={(value) =>
                        dispatch({
                            type: "UPDATE_ELEMENT_EXTRA_FIELD",
                            payload: {
                                elementId: element.id,
                                fieldKey: field.key,
                                fieldValue: value,
                            },
                        })
                    }
                />
            ))}
        </>
    );
};

interface ExtraFieldInputProps {
    elementId: string;
    fieldKey: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
}

const ExtraFieldInput = ({
    elementId,
    fieldKey,
    label,
    value,
    onChange,
}: ExtraFieldInputProps) => {
    const binding = useEditorFieldBinding<HTMLInputElement>({
        elementId,
        fieldId: elementExtraFieldFieldId(elementId, fieldKey),
    });

    return (
        <TextInput
            {...binding}
            fullWidth
            label={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
        />
    );
};
