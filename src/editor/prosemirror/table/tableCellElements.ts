import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { ListItem } from "../../../bindings/ListItem";
import type { TableCell } from "../../../bindings/TableCell";
import { quoteContentFieldId, richTextFieldId } from "../../fieldIds";
import { parseListItemFieldPath } from "../../listFieldPath";
import { createParagraph } from "../../../state/ast/defaults";
import {
    getListItemAtPath,
    listItemPlainLength,
    updateListItemAtPath,
} from "../../../state/ast/listItem";
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
        if (span.kind === "quote") {
            return total + span.text.length;
        }
        return total + span.text.length;
    }, 0);

const updateListItemsAtOffset = (
    items: ListItem[],
    offset: number,
    updater: (content: RichText[], localOffset: number) => RichText[],
): { items: ListItem[]; consumed: boolean; remaining: number } => {
    let remaining = offset;
    let consumed = false;
    const mapped = items.map((item) => {
        if (consumed) {
            return item;
        }
        const contentLen = richTextPlainLength(item.content);
        if (remaining <= contentLen) {
            consumed = true;
            return { ...item, content: updater(item.content, remaining) };
        }
        remaining -= contentLen;
        if (item.children.length > 0) {
            const nested = updateListItemsAtOffset(
                item.children,
                remaining,
                updater,
            );
            if (nested.consumed) {
                consumed = true;
                remaining = nested.remaining;
                return { ...item, children: nested.items };
            }
            remaining = nested.remaining;
        }
        return item;
    });
    return { items: mapped, consumed, remaining };
};

/** UTF-16 field length of one block inside a table cell (matches source-map widths). */
export const tableCellBlockFieldLength = (element: DocumentElement): number => {
    switch (element.type) {
        case "Paragraph":
        case "Quote":
            return richTextFieldLength(element.content);
        case "List":
        case "Enumeration":
            return element.items.reduce(
                (sum, item) => sum + listItemPlainLength(item),
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
            const path = parseListItemFieldPath(fieldId, element.id);
            if (!path) {
                return element;
            }
            const item = getListItemAtPath(element.items, path);
            if (!item) {
                return element;
            }
            const offset = caretOffset ?? richTextPlainLength(item.content);
            const content = updater(item.content, offset);
            return {
                ...element,
                items: updateListItemAtPath(element.items, path, content),
            };
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
                (sum, item) => sum + listItemPlainLength(item),
                0,
            );
            if (remaining <= length) {
                const updated = updateListItemsAtOffset(
                    element.items,
                    remaining,
                    updater,
                );
                return { ...element, items: updated.items };
            }
            remaining -= length;
        }
        return element;
    });
    return { ...cell, elements };
};
