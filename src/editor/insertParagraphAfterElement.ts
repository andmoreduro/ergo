import type { DocumentAST } from "../bindings/DocumentAST";
import type { ASTAction } from "../state/ast/actions";
import { createId } from "../state/ast/defaults";
import { richTextFieldId } from "./fieldIds";
import { trailingParagraphAction } from "./ensureTrailingParagraph";
import { contentSection } from "./fieldNavigation";
import type { DocumentFocusInput } from "../state/DocumentContext";

type Dispatch = (action: ASTAction) => void;
type SetDocumentFocus = (focus: DocumentFocusInput) => void;

export const insertParagraphAfterElement = (
    state: DocumentAST,
    dispatch: Dispatch,
    setDocumentFocus: SetDocumentFocus,
    afterElementId: string,
): void => {
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
            afterElementId,
        },
    });

    const remaining = section.elements;
    const insertIndex = remaining.findIndex((element) => element.id === afterElementId);
    const nextElements = [
        ...remaining.slice(0, insertIndex + 1),
        { type: "Paragraph" as const, id: paragraphId, content: [] },
        ...remaining.slice(insertIndex + 1),
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
