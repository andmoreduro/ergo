import { useCallback } from "react";
import { useDocumentActions, useDocumentAstStore } from "../state/DocumentContext";
import { insertParagraphAfterElement } from "./insertParagraphAfterElement";

export const useInsertParagraphAfterElement = (afterElementId: string) => {
    // Read the AST imperatively at call time so element editors don't subscribe
    // to (and re-render on) every AST commit just to hold a fresh snapshot.
    const { dispatch, setDocumentFocus } = useDocumentActions();
    const astStore = useDocumentAstStore();

    return useCallback(() => {
        insertParagraphAfterElement(
            astStore.getSnapshot(),
            dispatch,
            setDocumentFocus,
            afterElementId,
        );
    }, [afterElementId, astStore, dispatch, setDocumentFocus]);
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
