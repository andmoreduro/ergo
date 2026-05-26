import { tableColumnSizeFieldId } from "../../../../editor/fieldIds";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { TextInput } from "../../../atoms/TextInput/TextInput";
import type { TableElement } from "../types";

export const TableColumnSizeEditor = ({
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

