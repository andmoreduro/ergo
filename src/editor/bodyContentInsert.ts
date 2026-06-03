import type { EquationSyntax } from "../bindings/EquationSyntax";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { ElementType, InsertElementOptions } from "../commands/editorCommands";
import type { ASTAction } from "../state/ast/actions";
import { createId } from "../state/ast/defaults";
import type { DocumentFocusInput } from "../state/DocumentContext";
import { defaultFieldIdForElement } from "./fieldIds";
import { parseHeadingInsertLevel } from "./headingInsert";
import { insertParagraphAfterElement } from "./insertParagraphAfterElement";
import { contentSection } from "./fieldNavigation";
import { resolveContentInsertAnchor } from "./insertContext";
import { insertBodyInlineEquation } from "./prosemirror/bodyInsert";
import { getActiveBodyView } from "./prosemirror/activeView";
import { setPendingBlockEdit } from "./prosemirror/pendingBlockEdit";
import { focusTargetFromState } from "./prosemirror/selection";
import {
    isActiveTableCellEditing,
    isTableCellForbiddenInsert,
} from "./prosemirror/table/tableCellInsertPolicy";

export interface BodyEditorInsertDeps {
    getAst: () => DocumentAST;
    dispatch: (action: ASTAction) => void;
    setDocumentFocus: (focus: DocumentFocusInput) => void;
    defaultEquationSyntax: EquationSyntax;
}

let bodyEditorInsertDeps: BodyEditorInsertDeps | null = null;

export const setBodyEditorInsertDeps = (deps: BodyEditorInsertDeps | null): void => {
    bodyEditorInsertDeps = deps;
};

const afterElementFromBodySelection = (): string | null => {
    const view = getActiveBodyView();
    if (!view) {
        return null;
    }
    const target = focusTargetFromState(view.state);
    if (target?.elementId) {
        return target.elementId;
    }

    const { $from } = view.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
        const elementId = $from.node(depth).attrs.elementId;
        if (typeof elementId === "string" && elementId.length > 0) {
            return elementId;
        }
    }

    return null;
};

const focusNewElement = (
    deps: BodyEditorInsertDeps,
    elementId: string,
    rustType: Parameters<typeof defaultFieldIdForElement>[0]["type"],
): void => {
    deps.setDocumentFocus({
        elementId,
        fieldId: defaultFieldIdForElement({ id: elementId, type: rustType }),
        caretUtf16Offset: 0,
        sourceRevision: null,
        anchorPageNumber: null,
        forcePreviewScroll: false,
        focusSource: "programmatic",
    });
};

const removeReplacedEmptyBlock = (
    dispatch: (action: ASTAction) => void,
    replaceElementId: string | null,
): void => {
    if (!replaceElementId) {
        return;
    }
    dispatch({
        type: "REMOVE_ELEMENT",
        payload: { elementId: replaceElementId },
    });
};

/**
 * Insert a block after the ProseMirror selection in the main body editor.
 */
export const tryBodyContentInsert = (
    elementType: ElementType,
    options?: InsertElementOptions,
    invocationPayload?: unknown,
): boolean => {
    if (isActiveTableCellEditing()) {
        return false;
    }
    if (isTableCellForbiddenInsert(elementType)) {
        return false;
    }

    const deps = bodyEditorInsertDeps;
    const anchorElementId = afterElementFromBodySelection();
    if (!deps || !anchorElementId) {
        return false;
    }

    const state = deps.getAst();
    const section = contentSection(state);
    if (!section) {
        return false;
    }

    const { afterElementId, replaceElementId } = resolveContentInsertAnchor(
        section,
        anchorElementId,
    );
    if (!afterElementId) {
        return false;
    }

    const sectionId = section.id;
    const { dispatch, setDocumentFocus, defaultEquationSyntax } = deps;

    if (elementType === "paragraph") {
        insertParagraphAfterElement(state, dispatch, setDocumentFocus, afterElementId);
        removeReplacedEmptyBlock(dispatch, replaceElementId);
        return true;
    }

    if (elementType === "inlineEquation") {
        if (insertBodyInlineEquation("", defaultEquationSyntax)) {
            removeReplacedEmptyBlock(dispatch, replaceElementId);
            return true;
        }
    }

    const id = elementType === "diagram" ? `diagram-${createId()}` : createId();

    const finishBlockInsert = (
        elementId: string,
        rustType: Parameters<typeof defaultFieldIdForElement>[0]["type"],
    ) => {
        removeReplacedEmptyBlock(dispatch, replaceElementId);
        focusNewElement(deps, elementId, rustType);
    };

    if (elementType === "heading") {
        const level =
            options?.headingLevel ??
            parseHeadingInsertLevel(invocationPayload) ??
            1;
        dispatch({
            type: "ADD_HEADING",
            payload: {
                sectionId,
                headingId: id,
                afterElementId,
                level,
            },
        });
        finishBlockInsert(id, "Heading");
        return true;
    }

    if (elementType === "quote") {
        dispatch({
            type: "ADD_QUOTE",
            payload: { sectionId, quoteId: id, afterElementId },
        });
        finishBlockInsert(id, "Quote");
        return true;
    }

    if (elementType === "list") {
        dispatch({
            type: "ADD_LIST",
            payload: { sectionId, listId: id, afterElementId },
        });
        finishBlockInsert(id, "List");
        return true;
    }

    if (elementType === "enumeration") {
        dispatch({
            type: "ADD_ENUMERATION",
            payload: { sectionId, enumerationId: id, afterElementId },
        });
        finishBlockInsert(id, "Enumeration");
        return true;
    }

    if (elementType === "table") {
        dispatch({
            type: "ADD_TABLE",
            payload: { sectionId, tableId: id, afterElementId },
        });
        setPendingBlockEdit(id);
        finishBlockInsert(id, "Table");
        return true;
    }

    if (elementType === "equation" || elementType === "inlineEquation") {
        dispatch({
            type: "ADD_EQUATION",
            payload: {
                sectionId,
                equationId: id,
                afterElementId,
                syntax: defaultEquationSyntax,
            },
        });
        if (elementType === "inlineEquation") {
            dispatch({
                type: "UPDATE_EQUATION",
                payload: { equationId: id, isBlock: false },
            });
        } else {
            setPendingBlockEdit(id);
        }
        finishBlockInsert(id, "Equation");
        return true;
    }

    if (elementType === "diagram") {
        dispatch({
            type: "ADD_DIAGRAM",
            payload: { sectionId, diagramId: id, afterElementId },
        });
        finishBlockInsert(id, "Diagram");
        return true;
    }

    if (elementType === "figure") {
        dispatch({
            type: "ADD_FIGURE",
            payload: { sectionId, figureId: id, afterElementId },
        });
        finishBlockInsert(id, "Figure");
        return true;
    }

    return false;
};
