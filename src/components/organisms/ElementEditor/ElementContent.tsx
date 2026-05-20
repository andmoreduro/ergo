import { useDocument } from "../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../state/EditorFieldRegistry";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import { useActionDispatcher } from "../../../actions/runtime";
import {
    equationSourceFieldId,
    figureBodyFieldId,
    figureCaptionFieldId,
    figurePlacementFieldId,
    richTextFieldId,
    tableCellFieldId,
    tableColumnSizeFieldId,
} from "../../../editor/fieldIds";
import { Button } from "../../atoms/Button/Button";
import { Checkbox } from "../../atoms/Checkbox/Checkbox";
import { Select } from "../../atoms/Select/Select";
import { Textarea } from "../../atoms/Textarea/Textarea";
import { TextInput } from "../../atoms/TextInput/TextInput";
import { m } from "../../../paraglide/messages.js";
import styles from "./ElementEditor.module.css";

type HeadingElement = Extract<DocumentElement, { type: "Heading" }>;
type ParagraphElement = Extract<DocumentElement, { type: "Paragraph" }>;
type EquationElement = Extract<DocumentElement, { type: "Equation" }>;
type TableElement = Extract<DocumentElement, { type: "Table" }>;
type FigureElement = Extract<DocumentElement, { type: "Figure" }>;
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

export const ElementContent = ({ element }: { element: DocumentElement }) => {
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

    return <FigureEditor element={element} />;
};

const HeadingEditor = ({ element }: { element: HeadingElement }) => {
    const { dispatch } = useDocument();
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
    const { dispatch } = useDocument();
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
    const { dispatch } = useDocument();
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
    const { dispatch } = useDocument();
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
    const { dispatch } = useDocument();
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
    const { dispatch } = useDocument();
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
        </>
    );
};
