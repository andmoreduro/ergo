import { useCallback } from "react";
import { useDocument, useDocumentAst } from "../state/DocumentContext";
import { insertParagraphAfterElement } from "./insertParagraphAfterElement";

export const useInsertParagraphAfterElement = (afterElementId: string) => {
    const { state, dispatch } = useDocumentAst();
    const { setDocumentFocus } = useDocument();

    return useCallback(() => {
        insertParagraphAfterElement(
            state,
            dispatch,
            setDocumentFocus,
            afterElementId,
        );
    }, [afterElementId, dispatch, setDocumentFocus, state]);
};

export const useElementEnterInsertsParagraph = (afterElementId: string) => {
    const insertAfter = useInsertParagraphAfterElement(afterElementId);

    return useCallback(
        (event: { key: string; shiftKey: boolean; ctrlKey: boolean; preventDefault: () => void }) => {
            if (event.key !== "Enter" || event.shiftKey || event.ctrlKey) {
                return;
            }

            event.preventDefault();
            insertAfter();
        },
        [insertAfter],
    );
};
