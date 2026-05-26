import type { DocumentAST } from "../bindings/DocumentAST";
import type { ASTAction } from "../state/ast/actions";
import { createId } from "../state/ast/defaults";
import { contentSection, elementHasText, paragraphHasText } from "./fieldNavigation";

export const trailingParagraphAction = (
    ast: DocumentAST,
): ASTAction | null => {
    const section = contentSection(ast);
    if (!section) {
        return null;
    }

    const last = section.elements[section.elements.length - 1];
    if (!last) {
        return {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId: section.id,
                paragraphId: createId(),
            },
        };
    }

    if (last.type === "Paragraph" && !paragraphHasText(last.content)) {
        return null;
    }

    if (last.type === "Paragraph" && paragraphHasText(last.content)) {
        return {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId: section.id,
                paragraphId: createId(),
                afterElementId: last.id,
            },
        };
    }

    if (!elementHasText(last)) {
        return null;
    }

    return {
        type: "ADD_PARAGRAPH",
        payload: {
            sectionId: section.id,
            paragraphId: createId(),
            afterElementId: last.id,
        },
    };
};
