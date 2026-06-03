import { useCallback, useMemo } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { TemplateSpec } from "../bindings/TemplateSpec";
import { createId } from "../state/ast/defaults";
import { useDocumentActions, useDocumentAstStore } from "../state/DocumentContext";
import {
    caretOffsetAtEndForField,
    applyAstActions,
    planContentElementRemoval,
} from "./contentFocus";
import { getActiveBodyView } from "./prosemirror/activeView";
import {
    getLastBodyFocus,
    getLastTemplateFieldId,
} from "./editorFocusMemory";
import {
    buildEditorFieldOrder,
    contentSection,
    findLastTemplateFieldTarget,
    findNextEditorField,
    findPreviousEditorField,
} from "./fieldNavigation";

export const useFieldNavigation = (
    templateSpec: TemplateSpec | null,
    variantId: string | null,
) => {
    // Read the live AST from the store rather than subscribing via `useDocumentAst`.
    // Field order is only needed inside navigation callbacks (key/tab handlers), so
    // computing it lazily keeps this hook — and its host `Editor` — from re-rendering
    // on every keystroke, which would otherwise churn the EditorNavigation context.
    const astStore = useDocumentAstStore();
    const { dispatch, setDocumentFocus } = useDocumentActions();

    const getFieldOrder = useCallback(
        () => buildEditorFieldOrder(templateSpec, variantId, astStore.getSnapshot()),
        [astStore, templateSpec, variantId],
    );

    const focusField = useCallback(
        (elementId: string, fieldId: string, caretUtf16Offset = 0) => {
            setDocumentFocus({
                elementId,
                fieldId,
                caretUtf16Offset,
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
            const current = getFieldOrder().find(
                (entry) => entry.fieldId === fieldId,
            );
            if (current) {
                focusField(current.elementId, current.fieldId);
            }
        },
        [getFieldOrder, focusField],
    );

    const focusNextField = useCallback(
        (currentFieldId: string | null, options?: { createParagraphAtEnd?: boolean }) => {
            const next = findNextEditorField(getFieldOrder(), currentFieldId);
            if (next) {
                focusField(next.elementId, next.fieldId);
                return;
            }

            if (!options?.createParagraphAtEnd) {
                refocusField(currentFieldId);
                return;
            }

            const section = contentSection(astStore.getSnapshot());
            if (!section) {
                return;
            }

            const paragraphId = createId();
            dispatch({
                type: "ADD_PARAGRAPH",
                payload: {
                    sectionId: section.id,
                    paragraphId,
                    afterElementId:
                        section.elements[section.elements.length - 1]?.id,
                },
            });
            focusField(paragraphId, `${paragraphId}:text`);
        },
        [astStore, dispatch, getFieldOrder, focusField, refocusField],
    );

    const focusPreviousField = useCallback(
        (currentFieldId: string | null) => {
            const previous = findPreviousEditorField(getFieldOrder(), currentFieldId);
            if (previous) {
                focusField(previous.elementId, previous.fieldId);
                return;
            }
            refocusField(currentFieldId);
        },
        [getFieldOrder, focusField, refocusField],
    );

    const focusLastTemplateField = useCallback((): boolean => {
        const last = findLastTemplateFieldTarget(getFieldOrder());
        if (!last) {
            return false;
        }
        focusField(last.elementId, last.fieldId);
        return true;
    }, [getFieldOrder, focusField]);

    const focusLastFocusedTemplateField = useCallback((): boolean => {
        const remembered = getLastTemplateFieldId();
        if (remembered) {
            const entry = getFieldOrder().find(
                (item) => item.fieldId === remembered,
            );
            if (entry) {
                focusField(entry.elementId, entry.fieldId);
                return true;
            }
        }
        return focusLastTemplateField();
    }, [getFieldOrder, focusField, focusLastTemplateField]);

    const restoreLastBodyFocus = useCallback((): boolean => {
        const saved = getLastBodyFocus();
        if (!saved) {
            return false;
        }
        focusField(
            saved.elementId,
            saved.fieldId,
            saved.caretUtf16Offset ?? 0,
        );
        queueMicrotask(() => {
            getActiveBodyView()?.focus();
        });
        return true;
    }, [focusField]);

    const removeContentElement = useCallback(
        (ast: DocumentAST, elementId: string) => {
            const plan = planContentElementRemoval(ast, elementId);
            if (!plan) {
                return false;
            }

            const nextAst = applyAstActions(ast, plan.actions);
            for (const action of plan.actions) {
                dispatch(action);
            }
            focusField(
                plan.focus.elementId,
                plan.focus.fieldId,
                caretOffsetAtEndForField(
                    nextAst,
                    plan.focus.elementId,
                    plan.focus.fieldId,
                ),
            );
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
            event: {
                key: string;
                ctrlKey: boolean;
                metaKey?: boolean;
                shiftKey: boolean;
                preventDefault: () => void;
            },
            currentFieldId: string | null,
        ) => {
            const isShiftTab = event.key === "Tab" && event.shiftKey;
            const isTab = event.key === "Tab" && !event.shiftKey;
            const isCtrlTab =
                event.key === "Tab" &&
                (event.ctrlKey || event.metaKey) &&
                !event.shiftKey;
            const isCtrlEnter =
                event.key === "Enter" && event.ctrlKey && !event.shiftKey;

            if (isCtrlTab) {
                event.preventDefault();
                restoreLastBodyFocus();
                return true;
            }

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
        [focusNextField, focusPreviousField, handleFieldAdvance, restoreLastBodyFocus],
    );

    // Memoized so the EditorNavigation context value stays referentially stable
    // across renders (every member is a stable useCallback) — consumers don't
    // re-render just because the host re-rendered.
    return useMemo(
        () => ({
            focusField,
            focusNextField,
            focusPreviousField,
            focusLastTemplateField,
            focusLastFocusedTemplateField,
            restoreLastBodyFocus,
            removeContentElement,
            handleFieldAdvance,
            handleAdvanceKeyDown,
        }),
        [
            focusField,
            focusNextField,
            focusPreviousField,
            focusLastTemplateField,
            focusLastFocusedTemplateField,
            restoreLastBodyFocus,
            removeContentElement,
            handleFieldAdvance,
            handleAdvanceKeyDown,
        ],
    );
};
