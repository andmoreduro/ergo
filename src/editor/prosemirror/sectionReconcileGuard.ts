import type { ContentSection } from "../../bindings/ContentSection";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { RichText } from "../../bindings/RichText";
import { richTextSignificantlyEqual } from "../../state/ast/commitPolicy";

const richTextOf = (element: DocumentElement): RichText[] | null => {
    switch (element.type) {
        case "Paragraph":
        case "Heading":
        case "Quote":
            return element.content;
        default:
            return null;
    }
};

export const contentSectionFromAst = (
    ast: DocumentAST,
    sectionId: string,
): ContentSection | null => {
    const section = ast.sections.find((entry) => entry.id === sectionId);
    return section?.type === "Content" ? section : null;
};

export const paragraphHasUnderline = (
    elements: readonly DocumentElement[],
): boolean => {
    for (const element of elements) {
        const spans = richTextOf(element);
        if (spans?.some((span) => span.underline === true)) {
            return true;
        }
    }
    return false;
};

/**
 * True when PM and section share the same block ids/order but PM carries
 * compile-significant rich text (e.g. marks) that the section snapshot lacks.
 * Used to defer section→doc reconcile while a PM commit is propagating to the AST.
 */
export const pmFormattingAheadOfSection = (
    pmElements: readonly DocumentElement[],
    sectionElements: readonly DocumentElement[],
): boolean => {
    if (pmElements.length !== sectionElements.length) {
        return false;
    }
    for (let i = 0; i < pmElements.length; i += 1) {
        const pm = pmElements[i];
        const section = sectionElements[i];
        if (!pm || !section || pm.id !== section.id || pm.type !== section.type) {
            return false;
        }
        const pmText = richTextOf(pm);
        const sectionText = richTextOf(section);
        if (!pmText || !sectionText) {
            continue;
        }
        if (richTextSignificantlyEqual(pmText, sectionText)) {
            continue;
        }
        return true;
    }
    return false;
};
