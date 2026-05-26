import { tableCellFieldId } from "../../../../editor/fieldIds";
import { useDeferredTextCommit } from "../../../../editor/useDeferredTextCommit";
import { useElementEnterInsertsParagraph } from "../../../../editor/useInsertParagraphAfterElement";
import { normalizeEditableText } from "../../../../editor/textInput";
import { useEditorNavigation } from "../../../../editor/EditorNavigationContext";
import { useDocumentAst } from "../../../../state/DocumentContext";
import { useEditorFieldBinding } from "../../../../state/EditorFieldRegistry";
import { m } from "../../../../paraglide/messages.js";
import { TextInput } from "../../../atoms/TextInput/TextInput";
import type { TableElement } from "../types";
import styles from "../ElementEditor.module.css";

export const TableCellEditor = ({
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
    const handleEnterKey = useElementEnterInsertsParagraph(element.id);
    const { handleAdvanceKeyDown } = useEditorNavigation();
    const { draft, setDraft, shouldCommit } = useDeferredTextCommit(cellContent);
    const fieldId = tableCellFieldId(element.id, rowIndex, colIndex);
    const cellField = useEditorFieldBinding<HTMLInputElement>({
        elementId: element.id,
        fieldId,
    });

    return (
        <TextInput
            {...cellField}
            className={styles.tableCellInput}
            value={draft}
            aria-label={m.editor_table_cell_label({
                row: rowIndex + 1,
                column: colIndex + 1,
            })}
            onKeyDown={(event) => {
                if (handleAdvanceKeyDown(event, fieldId)) {
                    return;
                }
                handleEnterKey(event);
            }}
            onChange={(event) => {
                const next = normalizeEditableText(event.target.value);
                setDraft(next);
                if (shouldCommit(next)) {
                    dispatch({
                        type: "UPDATE_TABLE_CELL",
                        payload: {
                            tableId: element.id,
                            rowIndex,
                            colIndex,
                            text: next,
                        },
                    });
                }
            }}
        />
    );
};

