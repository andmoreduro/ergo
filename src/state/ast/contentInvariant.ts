import type { ContentSection } from "../../bindings/ContentSection";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { ASTAction } from "./actions";
import { createId, createParagraph } from "./defaults";

const contentSection = (ast: DocumentAST): ContentSection | undefined => {
    const section = ast.sections.find((item) => item.type === "Content");
    return section?.type === "Content" ? section : undefined;
};

export const contentSectionHasParagraph = (section: ContentSection): boolean =>
    section.elements.some((element) => element.type === "Paragraph");

/** Ensures the main content section always has at least one paragraph block. */
export const ensureMinimumContentParagraphAction = (
    ast: DocumentAST,
): Extract<ASTAction, { type: "ADD_PARAGRAPH" }> | null => {
    const section = contentSection(ast);
    if (!section || contentSectionHasParagraph(section)) {
        return null;
    }

    return {
        type: "ADD_PARAGRAPH",
        payload: {
            sectionId: section.id,
            paragraphId: createId(),
        },
    };
};

export const applyMinimumContentParagraph = (ast: DocumentAST): DocumentAST => {
    const action = ensureMinimumContentParagraphAction(ast);
    if (!action) {
        return ast;
    }

    const { sectionId, paragraphId } = action.payload;
    return {
        ...ast,
        sections: ast.sections.map((section) => {
            if (section.type !== "Content" || section.id !== sectionId) {
                return section;
            }

            return {
                ...section,
                elements: [...section.elements, createParagraph("", paragraphId)],
            };
        }),
    };
};
