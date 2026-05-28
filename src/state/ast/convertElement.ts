import type { DocumentAST } from "../../bindings/DocumentAST";
import type { DocumentElement } from "../../bindings/DocumentElement";
import type { RichText } from "../../bindings/RichText";
import {
    createEnumeration,
    createEquation,
    createFigure,
    createList,
    createParagraph,
    createQuote,
    createRichText,
    createTable,
} from "./defaults";
import { richTextPlainText } from "../documentEvents/helpers";

export type ConvertibleElementKind =
    | "Paragraph"
    | "Heading"
    | "Table"
    | "Equation"
    | "Figure"
    | "Quote"
    | "List"
    | "Enumeration";

const richTextFromElement = (element: DocumentElement): RichText[] => {
    if (element.type === "Paragraph" || element.type === "Heading") {
        return element.content;
    }

    if (element.type === "Equation") {
        return element.latex_source
            ? [createRichText(element.latex_source)]
            : [];
    }

    if (element.type === "Quote") {
        return element.content;
    }

    if (element.type === "List" || element.type === "Enumeration") {
        return element.items.flatMap((item, index) =>
            index === 0 ? item : [createRichText("\n"), ...item],
        );
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
            return { type: "Paragraph", id, content };
        case "Heading":
            return { type: "Heading", id, level: 2, content };
        case "Equation":
            return createEquation(id, plain);
        case "Table":
            return createTable(2, 2, id);
        case "Figure": {
            const figure = createFigure(id);
            if (figure.type === "Figure" && content.length > 0) {
                return {
                    ...figure,
                    content:
                        figure.content.type === "Paragraph"
                            ? { ...figure.content, content }
                            : createParagraph(""),
                };
            }
            return figure;
        }
        case "Quote": {
            const quote = createQuote("", id);
            return quote.type === "Quote" ? { ...quote, content } : quote;
        }
        case "List": {
            const list = createList(id);
            return list.type === "List" ? { ...list, items: [content] } : list;
        }
        case "Enumeration": {
            const enumeration = createEnumeration(id);
            return enumeration.type === "Enumeration"
                ? { ...enumeration, items: [content] }
                : enumeration;
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
