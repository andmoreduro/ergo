import type { Fragment, Node as PMNode } from "prosemirror-model";
import type { DocumentElement } from "../../../bindings/DocumentElement";
import type { ListItem } from "../../../bindings/ListItem";
import type { TableCell } from "../../../bindings/TableCell";
import { createId, createListItem } from "../../../state/ast/defaults";
import {
    quoteElementFromQuoteNode,
    quoteNodeAttributionAttrs,
} from "../../quoteAttribution";
import {
    fragmentToRichText,
    listItemFromNode,
    listItemToNode,
    richTextToInlineNodes,
} from "../astBridge";
import type { TableSchema } from "./tableSchema";
import { normalizeTableCellElements } from "./tableCellElements";

const listNode = (
    schema: TableSchema,
    id: string,
    ordered: boolean,
    items: ListItem[],
): PMNode => {
    const source = items.length > 0 ? items : [createListItem()];
    const listItems = source.map((item) => listItemToNode(schema, item, ordered));
    return schema.nodes.list.create({ elementId: id, ordered }, listItems);
};

export const cellElementToNode = (
    schema: TableSchema,
    element: DocumentElement,
): PMNode => {
    switch (element.type) {
        case "Paragraph":
            return schema.nodes.paragraph.create(
                { elementId: element.id },
                richTextToInlineNodes(schema, element.content),
            );
        case "Quote":
            return schema.nodes.quote.create(
                {
                    elementId: element.id,
                    ...quoteNodeAttributionAttrs(element),
                },
                richTextToInlineNodes(schema, element.content),
            );
        case "List":
            return listNode(schema, element.id, false, element.items);
        case "Enumeration":
            return listNode(schema, element.id, true, element.items);
        case "Equation":
            return schema.nodes.equation.create({
                element,
                elementId: element.id,
            });
        default:
            return schema.nodes.paragraph.create(
                { elementId: createId() },
                richTextToInlineNodes(schema, []),
            );
    }
};

export const cellFragmentToElements = (
    _schema: TableSchema,
    fragment: Fragment,
): DocumentElement[] => {
    const elements: DocumentElement[] = [];
    fragment.forEach((node) => {
        switch (node.type.name) {
            case "paragraph":
                elements.push({
                    type: "Paragraph",
                    id: node.attrs.elementId || createId(),
                    content: fragmentToRichText(node.content),
                });
                break;
            case "quote":
                elements.push(
                    quoteElementFromQuoteNode(
                        {
                            attrs: {
                                elementId: node.attrs.elementId || createId(),
                                attributionText: node.attrs.attributionText,
                                attributionReferenceId:
                                    node.attrs.attributionReferenceId,
                            },
                        },
                        fragmentToRichText(node.content),
                    ),
                );
                break;
            case "list": {
                const items: ListItem[] = [];
                node.content.forEach((item) => items.push(listItemFromNode(item)));
                elements.push(
                    node.attrs.ordered
                        ? {
                              type: "Enumeration",
                              id: node.attrs.elementId || createId(),
                              items,
                          }
                        : {
                              type: "List",
                              id: node.attrs.elementId || createId(),
                              items,
                          },
                );
                break;
            }
            case "equation": {
                const element = node.attrs.element as DocumentElement | null;
                if (element?.type === "Equation") {
                    elements.push(element);
                }
                break;
            }
            default:
                break;
        }
    });
    return normalizeTableCellElements(elements);
};

export const tableCellToSubDocNodes = (
    schema: TableSchema,
    cell: TableCell,
): PMNode[] =>
    normalizeTableCellElements(cell.elements).map((element) =>
        cellElementToNode(schema, element),
    );

export const subDocFragmentToTableCell = (
    schema: TableSchema,
    fragment: Fragment,
    prev: TableCell,
): TableCell => ({
    elements: cellFragmentToElements(schema, fragment),
    row_span: prev.row_span,
    col_span: prev.col_span,
});
