import type { DocumentAST } from "../bindings/DocumentAST";
import type { ASTAction } from "../state/ast/actions";
import { createId } from "../state/ast/defaults";
import { richTextFieldId } from "./fieldIds";
import { trailingParagraphAction } from "./ensureTrailingParagraph";
import { contentSection } from "./fieldNavigation";
import type { DocumentFocusInput } from "../state/DocumentContext";

type Dispatch = (action: ASTAction) => void;
type SetDocumentFocus = (focus: DocumentFocusInput) => void;

/** Inserts a paragraph immediately before `beforeElementId` in the content section. */
export const insertParagraphBeforeElement = (
    state: DocumentAST,
    dispatch: Dispatch,
    setDocumentFocus: SetDocumentFocus,
    beforeElementId: string,
): void => {
    const section = contentSection(state);
    if (!section) {
        return;
    }

    const insertIndex = section.elements.findIndex(
        (element) => element.id === beforeElementId,
    );
    if (insertIndex < 0) {
        return;
    }

    const afterElementId =
        insertIndex > 0 ? section.elements[insertIndex - 1]!.id : undefined;

    const paragraphId = createId();
    dispatch({
        type: "ADD_PARAGRAPH",
        payload: {
            sectionId: section.id,
            paragraphId,
            afterElementId,
        },
    });

    const remaining = section.elements;
    const nextElements = [
        ...remaining.slice(0, insertIndex),
        { type: "Paragraph" as const, id: paragraphId, content: [] },
        ...remaining.slice(insertIndex),
    ];
    const provisionalAst: DocumentAST = {
        ...state,
        sections: state.sections.map((candidate) =>
            candidate.type === "Content" && candidate.id === section.id
                ? { ...candidate, elements: nextElements }
                : candidate,
        ),
    };
    const trailing = trailingParagraphAction(provisionalAst);
    if (trailing) {
        dispatch(trailing);
    }

    setDocumentFocus({
        elementId: paragraphId,
        fieldId: richTextFieldId(paragraphId),
        caretUtf16Offset: 0,
        sourceRevision: null,
        anchorPageNumber: null,
        forcePreviewScroll: false,
        focusSource: "programmatic",
    });
};
