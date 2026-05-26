import { useCallback, useMemo } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { TemplateSpec } from "../bindings/TemplateSpec";
import { createId } from "../state/ast/defaults";
import { useDocument, useDocumentAst } from "../state/DocumentContext";
import {
    buildEditorFieldOrder,
    contentSection,
    findNextEditorField,
} from "./fieldNavigation";

export const useFieldNavigation = (
    templateSpec: TemplateSpec | null,
    variantId: string | null,
) => {
    const { state, dispatch } = useDocumentAst();
    const { setDocumentFocus } = useDocument();

    const fieldOrder = useMemo(
        () => buildEditorFieldOrder(templateSpec, variantId, state),
        [state, templateSpec, variantId],
    );

    const focusField = useCallback(
        (elementId: string, fieldId: string) => {
            setDocumentFocus({
                elementId,
                fieldId,
                caretUtf16Offset: 0,
                sourceRevision: null,
                anchorPageNumber: null,
                forcePreviewScroll: false,
                focusSource: "programmatic",
            });
        },
        [setDocumentFocus],
    );

    const focusNextField = useCallback(
        (currentFieldId: string | null) => {
            const next = findNextEditorField(fieldOrder, currentFieldId);
            if (next) {
                focusField(next.elementId, next.fieldId);
                return;
            }

            const section = contentSection(state);
            if (!section) {
                return;
            }

            const paragraphId = createId();
            dispatch({
                type: "ADD_PARAGRAPH",
                payload: {
                    sectionId: section.id,
                    paragraphId,
                    afterElementId: section.elements.at(-1)?.id,
                },
            });
            focusField(paragraphId, `${paragraphId}:text`);
        },
        [dispatch, fieldOrder, focusField, state],
    );

    const handleFieldAdvance = useCallback(
        (currentFieldId: string | null) => {
            focusNextField(currentFieldId);
        },
        [focusNextField],
    );

    const handleAdvanceKeyDown = useCallback(
        (
            event: { key: string; ctrlKey: boolean; shiftKey: boolean; preventDefault: () => void },
            currentFieldId: string | null,
        ) => {
            const isTab = event.key === "Tab" && !event.shiftKey;
            const isCtrlEnter = event.key === "Enter" && event.ctrlKey && !event.shiftKey;
            if (!isTab && !isCtrlEnter) {
                return false;
            }

            event.preventDefault();
            handleFieldAdvance(currentFieldId);
            return true;
        },
        [handleFieldAdvance],
    );

    return {
        fieldOrder,
        focusField,
        focusNextField,
        handleFieldAdvance,
        handleAdvanceKeyDown,
    };
};

