import type { DocumentAST } from "../bindings/DocumentAST";
import type { ASTAction } from "../state/ast/actions";
import { createId } from "../state/ast/defaults";
import type { DocumentFocusInput } from "../state/DocumentContext";
import { defaultFieldIdForElement } from "./fieldIds";
import { contentSection } from "./fieldNavigation";
import { resolveContentInsertAnchor } from "./insertContext";
import { elementIdOf } from "../state/documentEvents/helpers.js";

export const insertFigureWithAsset = (
    ast: DocumentAST,
    assetId: string,
    dispatch: (action: ASTAction) => void,
    setDocumentFocus: (focus: DocumentFocusInput) => void,
    anchorElementId?: string | null,
): boolean => {
    const section = contentSection(ast);
    if (!section) {
        return false;
    }

    const figureId = createId();
    const anchor = resolveContentInsertAnchor(section, anchorElementId);

    dispatch({
        type: "ADD_FIGURE",
        payload: {
            sectionId: anchor.sectionId,
            figureId,
            afterElementId: anchor.afterElementId,
        },
    });

    if (anchor.replaceElementId) {
        dispatch({
            type: "REMOVE_ELEMENT",
            payload: { elementId: anchor.replaceElementId },
        });
    }

    dispatch({
        type: "UPDATE_FIGURE",
        payload: { figureId, assetId },
    });

    setDocumentFocus({
        elementId: figureId,
        fieldId: defaultFieldIdForElement({ id: figureId, type: "Figure" }),
        caretUtf16Offset: 0,
        sourceRevision: null,
        anchorPageNumber: null,
        forcePreviewScroll: false,
        focusSource: "programmatic",
    });

    return true;
};

export const lastContentElementId = (ast: DocumentAST): string | undefined => {
    const section = contentSection(ast);
    if (!section || section.elements.length === 0) {
        return undefined;
    }
    return elementIdOf(section.elements[section.elements.length - 1]);
};
