import { useEffect, useState, type CSSProperties } from "react";

import { elementExtraFieldFieldId } from "../../../../editor/fieldIds";

import { getPlacementOptions, tablePlacementValue } from "../../../../editor/placementOptions";

import { usesStandardTypstFigureWrapper } from "../../../../editor/templateElementOverrides";

import { useDocumentAst } from "../../../../state/DocumentContext";

import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";

import { useTemplateSpecContext } from "../../../../state/TemplateSpecContext";

import { m } from "../../../../paraglide/messages.js";

import { EditorAddButton } from "../../../atoms/EditorAddButton/EditorAddButton";

import { Select } from "../../../atoms/Select/Select";

import { ElementExtrasCollapse } from "../ElementExtrasCollapse";

import { ElementSettingsButton } from "../ElementSettingsButton";

import { ElementAnnotationFields } from "../fields/ElementAnnotationFields";

import { TableCellEditor } from "../table/TableCellEditor";

import { TableColumnSizeEditor } from "../table/TableColumnSizeEditor";

import type { TableElement } from "../types";

import styles from "../ElementEditor.module.css";



export const TableEditor = ({ element }: { element: TableElement }) => {

    const { dispatch } = useDocumentAst();

    const { spec: templateSpec } = useTemplateSpecContext();

    const tableOverride = templateSpec?.element_overrides?.table ?? null;

    const showPlacement = usesStandardTypstFigureWrapper(tableOverride);

    const annotationFields = tableOverride?.extra_fields ?? [];

    const committedPlacement = tablePlacementValue(element.extra_fields);

    const [draftPlacement, setDraftPlacement] = useState(committedPlacement);

    const placementField = useEditorFieldBinding<HTMLSelectElement>({

        elementId: element.id,

        fieldId: elementExtraFieldFieldId(element.id, "placement"),

    });



    useEffect(() => {

        setDraftPlacement(committedPlacement);

    }, [committedPlacement, element.id]);



    const insertRow = (rowIndex: number) => {

        dispatch({

            type: "ADD_TABLE_ROW",

            payload: { tableId: element.id, rowIndex },

        });

    };



    const insertColumn = (colIndex: number) => {

        dispatch({

            type: "ADD_TABLE_COLUMN",

            payload: { tableId: element.id, colIndex },

        });

    };



    const hasSettings = showPlacement || element.column_sizes.length > 0;



    return (

        <>

            {hasSettings ? (

                <ElementSettingsButton>

                    {showPlacement ? (

                        <Select

                            {...placementField}

                            fullWidth

                            label={m.editor_table_placement()}

                            value={draftPlacement}

                            options={getPlacementOptions()}

                            onChange={(event) => {

                                const next = event.target.value;

                                setDraftPlacement(next);

                                dispatch({

                                    type: "UPDATE_ELEMENT_EXTRA_FIELD",

                                    payload: {

                                        elementId: element.id,

                                        fieldKey: "placement",

                                        fieldValue: next,

                                    },

                                });

                            }}

                        />

                    ) : null}

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

                </ElementSettingsButton>

            ) : null}

            <ElementExtrasCollapse

                showToggle={annotationFields.length > 0}

                primary={

                    <div className={`${styles.tableWrap} ${styles.elementPrimary}`}>

                        <div

                            className={`${styles.tableFrame} ${styles.editorTableGridSize}`}

                        >

                            <EditorAddButton

                                ariaLabel={m.editor_table_add_row()}

                                className={`${styles.tableInsertButton} ${styles.tableInsertTop}`}

                                onClick={() => insertRow(0)}

                            />

                            <EditorAddButton

                                ariaLabel={m.editor_table_add_row()}

                                className={`${styles.tableInsertButton} ${styles.tableInsertBottom}`}

                                onClick={() => insertRow(element.cells.length)}

                            />

                            <EditorAddButton

                                ariaLabel={m.editor_table_add_column()}

                                className={`${styles.tableInsertButton} ${styles.tableInsertLeft}`}

                                onClick={() => insertColumn(0)}

                            />

                            <EditorAddButton

                                ariaLabel={m.editor_table_add_column()}

                                className={`${styles.tableInsertButton} ${styles.tableInsertRight}`}

                                onClick={() => insertColumn(element.cols)}

                            />

                            <div

                                className={`${styles.tableGrid} ${styles.editorTableGridSize}`}

                                style={

                                    {

                                        "--table-cols": String(element.cols),

                                    } as CSSProperties

                                }

                            >

                                {element.cells.map((row, rowIndex) => (

                                    <div

                                        className={styles.tableRow}

                                        key={`row-${rowIndex}`}

                                    >

                                        {row.map((cell, colIndex) => (

                                            <TableCellEditor

                                                cellContent={cell.content}

                                                colIndex={colIndex}

                                                element={element}

                                                key={`cell-${rowIndex}-${colIndex}`}

                                                rowIndex={rowIndex}

                                            />

                                        ))}

                                    </div>

                                ))}

                            </div>

                        </div>

                    </div>

                }

                extras={

                    <ElementAnnotationFields

                        element={element}

                        fields={annotationFields}

                    />

                }

            />

        </>

    );

};


