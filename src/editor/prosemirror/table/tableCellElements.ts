import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { TableCell } from "../../../bindings/TableCell";
import { quoteContentFieldId, richTextFieldId } from "../../fieldIds";
import { createParagraph } from "../../../state/ast/defaults";
import { richTextPlainLength } from "../../../richText/richText";
import type { RichText } from "../../../bindings/RichText";

const richTextFieldLength = (content: readonly RichText[]): number =>
    content.reduce((total, span) => {
        if (span.kind === "reference") {
            return total;
        }
        if (span.kind === "inlineEquation") {
            return total + (span.equation_source ?? "").length;
        }
        return total + span.text.length;
    }, 0);

/** UTF-16 field length of one block inside a table cell (matches source-map widths). */
export const tableCellBlockFieldLength = (element: DocumentElement): number => {
    switch (element.type) {
        case "Paragraph":
        case "Quote":
            return richTextFieldLength(element.content);
        case "List":
        case "Enumeration":
            return element.items.reduce(
                (sum, item) => sum + richTextPlainLength(item),
                0,
            );
        case "Equation":
            return element.latex_source.length;
        default:
            return 0;
    }
};

export const tableCellFieldLength = (cell: TableCell): number =>
    cell.elements.reduce((sum, block) => sum + tableCellBlockFieldLength(block), 0);

export const tableCellElementsEqual = (
    a: readonly DocumentElement[],
    b: readonly DocumentElement[],
): boolean => JSON.stringify(a) === JSON.stringify(b);

export const normalizeTableCellElements = (
    elements: readonly DocumentElement[],
): DocumentElement[] =>
    elements.length > 0 ? [...elements] : [createParagraph()];

export const updateTableCellRichTextAtField = (
    cell: TableCell,
    _elementId: string,
    fieldId: string,
    caretOffset: number | null,
    updater: (content: RichText[], localOffset: number) => RichText[],
): TableCell => {
    const elements = cell.elements.map((element) => {
        if (
            element.type === "Paragraph" &&
            fieldId === richTextFieldId(element.id)
        ) {
            const offset =
                caretOffset ??
                element.content.reduce(
                    (sum, span) => sum + richTextPlainLength([span]),
                    0,
                );
            return {
                ...element,
                content: updater(element.content, offset),
            };
        }
        if (
            element.type === "Quote" &&
            fieldId === quoteContentFieldId(element.id)
        ) {
            const offset =
                caretOffset ??
                element.content.reduce(
                    (sum, span) => sum + richTextPlainLength([span]),
                    0,
                );
            return {
                ...element,
                content: updater(element.content, offset),
            };
        }
        if (element.type === "List" || element.type === "Enumeration") {
            const prefix = `${element.id}:item:`;
            if (!fieldId.startsWith(prefix)) {
                return element;
            }
            const itemIndex = Number(fieldId.slice(prefix.length));
            if (!Number.isInteger(itemIndex) || itemIndex >= element.items.length) {
                return element;
            }
            const items = element.items.map((item, index) => {
                if (index !== itemIndex) {
                    return item;
                }
                const offset =
                    caretOffset ?? richTextPlainLength(item);
                return updater(item, offset);
            });
            return { ...element, items };
        }
        return element;
    });
    return { ...cell, elements };
};

export const updateTableCellRichTextAtOffset = (
    cell: TableCell,
    offset: number,
    updater: (content: RichText[], localOffset: number) => RichText[],
): TableCell => {
    let remaining = offset;
    const elements = cell.elements.map((element) => {
        if (element.type === "Paragraph" || element.type === "Quote") {
            const length = richTextFieldLength(element.content);
            if (remaining <= length) {
                return {
                    ...element,
                    content: updater(element.content, remaining),
                };
            }
            remaining -= length;
            return element;
        }
        if (element.type === "List" || element.type === "Enumeration") {
            const length = element.items.reduce(
                (sum, item) => sum + richTextPlainLength(item),
                0,
            );
            if (remaining <= length) {
                let itemRemaining = remaining;
                const items = element.items.map((item) => {
                    const itemLen = richTextPlainLength(item);
                    if (itemRemaining <= itemLen) {
                        const next = updater(item, itemRemaining);
                        itemRemaining = itemLen;
                        return next;
                    }
                    itemRemaining -= itemLen;
                    return item;
                });
                return { ...element, items };
            }
            remaining -= length;
        }
        return element;
    });
    return { ...cell, elements };
};
