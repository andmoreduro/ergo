import { useDocument } from "../../../state/DocumentContext";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import {
    ActionContextProvider,
    useActionDispatcher,
    type ActionHandlerMap,
} from "../../../actions/runtime";
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

type RichTextElement = Extract<DocumentElement, { type: "Heading" | "Paragraph" }>;

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
    const { dispatch, setActiveElementId } = useDocument();
    const dispatchAction = useActionDispatcher();

    const handleDelete = () => {
        if (window.confirm(m.element_delete_confirm())) {
            dispatch({ type: "REMOVE_ELEMENT", payload: { elementId: element.id } });
        }
    };

    const elementHandlers: ActionHandlerMap = {
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
                    : element.rows - 1;

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
                    : element.cols - 1;

            dispatch({
                type: "REMOVE_TABLE_COLUMN",
                payload: {
                    tableId: element.id,
                    colIndex,
                },
            });
            return true;
        },
    };

    const renderContent = () => {
        if (element.type === "Heading") {
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
        }

        if (element.type === "Paragraph") {
            return (
                <Textarea
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
        }

        if (element.type === "Equation") {
            return (
                <>
                    <Textarea
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
        }

        if (element.type === "Table") {
            return (
                <>
                    <div className={styles.columnSizes}>
                        {element.column_sizes.map((size, colIndex) => (
                            <TextInput
                                key={colIndex}
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
                        ))}
                    </div>
                    <div className={styles.tableGrid}>
                        {element.cells.map((row, rowIndex) => (
                            <div className={styles.tableRow} key={rowIndex}>
                                {row.map((cell, colIndex) => (
                                    <TextInput
                                        key={colIndex}
                                        value={cell.content}
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
        }

        if (element.type === "Figure") {
            const bodyText =
                element.content.type === "Paragraph"
                    ? richTextToString(element.content)
                    : "";

            return (
                <>
                    <Textarea
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
        }

        return null;
    };

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
            <div
                className={styles.container}
                data-element-id={element.id}
                onFocus={() => setActiveElementId(element.id)}
            >
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
                <div className={styles.content}>{renderContent()}</div>
            </div>
        </ActionContextProvider>
    );
};
