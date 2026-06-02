import { memo, useMemo } from "react";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import {
    ActionContextProvider,
    type ActionHandlerMap,
} from "../../../actions/runtime";
import { useDocumentAst } from "../../../state/DocumentContext";
import { ElementContent } from "./ElementContent";
import styles from "./ElementEditor.module.css";

export interface ElementEditorProps {
    element: DocumentElement;
}

export const ElementEditor = memo(function ElementEditor({
    element,
}: ElementEditorProps) {
    const { dispatch } = useDocumentAst();
    const tableRows = element.type === "Table" ? element.rows : 0;
    const tableCols = element.type === "Table" ? element.cols : 0;

    const elementHandlers: ActionHandlerMap = useMemo(
        () => ({
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
        [dispatch, element.id, element.type, tableCols, tableRows],
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
            <div className={styles.elementBlock} data-element-id={element.id}>
                <ElementContent element={element} />
            </div>
        </ActionContextProvider>
    );
});
