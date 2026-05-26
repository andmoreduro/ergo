import { useCallback, useMemo } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { TemplateSpec } from "../bindings/TemplateSpec";
import { createId } from "../state/ast/defaults";
import { useDocument, useDocumentAst } from "../state/DocumentContext";
import {
    planContentElementRemoval,
} from "./contentFocus";
import {
    buildEditorFieldOrder,
    contentSection,
    findNextEditorField,
    findPreviousEditorField,
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

    const refocusField = useCallback(
        (fieldId: string | null) => {
            if (!fieldId) {
                return;
            }
            const current = fieldOrder.find((entry) => entry.fieldId === fieldId);
            if (current) {
                focusField(current.elementId, current.fieldId);
            }
        },
        [fieldOrder, focusField],
    );

    const focusNextField = useCallback(
        (currentFieldId: string | null, options?: { createParagraphAtEnd?: boolean }) => {
            const next = findNextEditorField(fieldOrder, currentFieldId);
            if (next) {
                focusField(next.elementId, next.fieldId);
                return;
            }

            if (!options?.createParagraphAtEnd) {
                refocusField(currentFieldId);
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
        [dispatch, fieldOrder, focusField, refocusField, state],
    );

    const focusPreviousField = useCallback(
        (currentFieldId: string | null) => {
            const previous = findPreviousEditorField(fieldOrder, currentFieldId);
            if (previous) {
                focusField(previous.elementId, previous.fieldId);
                return;
            }
            refocusField(currentFieldId);
        },
        [fieldOrder, focusField, refocusField],
    );

    const removeContentElement = useCallback(
        (ast: DocumentAST, elementId: string) => {
            const plan = planContentElementRemoval(ast, elementId);
            if (!plan) {
                return false;
            }

            for (const action of plan.actions) {
                dispatch(action);
            }
            focusField(plan.focus.elementId, plan.focus.fieldId);
            return true;
        },
        [dispatch, focusField],
    );

    const handleFieldAdvance = useCallback(
        (currentFieldId: string | null) => {
            focusNextField(currentFieldId, { createParagraphAtEnd: true });
        },
        [focusNextField],
    );

    const handleAdvanceKeyDown = useCallback(
        (
            event: { key: string; ctrlKey: boolean; shiftKey: boolean; preventDefault: () => void },
            currentFieldId: string | null,
        ) => {
            const isShiftTab = event.key === "Tab" && event.shiftKey;
            const isTab = event.key === "Tab" && !event.shiftKey;
            const isCtrlEnter =
                event.key === "Enter" && event.ctrlKey && !event.shiftKey;

            if (isShiftTab) {
                event.preventDefault();
                focusPreviousField(currentFieldId);
                return true;
            }

            if (isTab) {
                event.preventDefault();
                focusNextField(currentFieldId);
                return true;
            }

            if (isCtrlEnter) {
                event.preventDefault();
                handleFieldAdvance(currentFieldId);
                return true;
            }

            return false;
        },
        [focusNextField, focusPreviousField, handleFieldAdvance],
    );

    return {
        fieldOrder,
        focusField,
        focusNextField,
        focusPreviousField,
        removeContentElement,
        handleFieldAdvance,
        handleAdvanceKeyDown,
    };
};
