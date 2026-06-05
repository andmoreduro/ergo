import type { ContentSection } from "../bindings/ContentSection";
import type { DocumentElement } from "../bindings/DocumentElement";
import { richTextPlainLength } from "../richText/richText";
import { listItemPlainLength } from "../state/ast/listItem";

export type ContentInsertAnchor = {
    sectionId: string;
    afterElementId?: string;
    replaceElementId: string | null;
};

const listOrEnumerationIsEmpty = (element: DocumentElement): boolean => {
    if (element.type !== "List" && element.type !== "Enumeration") {
        return false;
    }
    if (element.items.length === 0) {
        return true;
    }
    return element.items.every((item) => listItemPlainLength(item) === 0);
};

/** Block types that are removed when empty and the user inserts another block at that anchor. */
export const isReplaceableEmptyElement = (element: DocumentElement): boolean => {
    switch (element.type) {
        case "Paragraph":
        case "Heading":
        case "Quote":
            return richTextPlainLength(element.content) === 0;
        case "List":
        case "Enumeration":
            return listOrEnumerationIsEmpty(element);
        default:
            return false;
    }
};

/** Where a new content-section block should be inserted relative to the current anchor. */
export const resolveContentInsertAnchor = (
    section: ContentSection,
    anchorElementId: string | null | undefined,
): ContentInsertAnchor => {
    const afterElementId =
        anchorElementId &&
        anchorElementId !== "project" &&
        anchorElementId !== "inputs"
            ? anchorElementId
            : undefined;

    const replaceTarget =
        afterElementId === undefined
            ? undefined
            : section.elements.find((element) => element.id === afterElementId);

    const replaceElementId =
        replaceTarget && isReplaceableEmptyElement(replaceTarget)
            ? replaceTarget.id
            : null;

    return {
        sectionId: section.id,
        afterElementId,
        replaceElementId,
    };
};
