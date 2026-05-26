import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { RichText } from "../bindings/RichText";
import {
    createEquation,
    createFigure,
    createHeading,
    createParagraph,
    createTable,
} from "./defaults";
import { richTextPlainText } from "../documentEvents/helpers";

export type ConvertibleElementKind =
    | "Paragraph"
    | "Heading"
    | "Table"
    | "Equation"
    | "Figure";

const richTextFromElement = (element: DocumentElement): RichText[] => {
    if (element.type === "Paragraph" || element.type === "Heading") {
        return element.content;
    }

    if (element.type === "Equation") {
        return element.latex_source
            ? [{ text: element.latex_source, bold: null, italic: null, kind: null, reference_id: null, equation_source: null }]
            : [];
    }

    if (
        element.type === "Figure" &&
        element.content.type === "Paragraph"
    ) {
        return element.content.content;
    }

    return [];
};

export const convertElement = (
    element: DocumentElement,
    targetKind: ConvertibleElementKind,
): DocumentElement => {
    const id = element.id;
    const content = richTextFromElement(element);
    const plain = richTextPlainText(content);

    switch (targetKind) {
        case "Paragraph":
            return {
                ...createParagraph("", id),
                content,
            };
        case "Heading":
            return {
                ...createHeading(2, plain, id),
                content,
            };
        case "Equation":
            return createEquation(id, plain);
        case "Table":
            return createTable(2, 2, id);
        case "Figure": {
            const figure = createFigure(id);
            if (content.length > 0) {
                return {
                    ...figure,
                    content: createParagraph("", figure.content.type === "Paragraph" ? figure.content.id : id),
                };
            }
            return figure;
        }
        default:
            return element;
    }
};

export const findContentElement = (
    ast: DocumentAST,
    elementId: string,
): { sectionId: string; index: number; element: DocumentElement } | null => {
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }

        const index = section.elements.findIndex((entry) => entry.id === elementId);
        if (index >= 0) {
            return {
                sectionId: section.id,
                index,
                element: section.elements[index]!,
            };
        }
    }

    return null;
};
