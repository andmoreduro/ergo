import type { DocumentElement } from "../../bindings/DocumentElement";
import type { ListItem } from "../../bindings/ListItem";
import type { TableCell } from "../../bindings/TableCell";
import { createId } from "./defaults";

/** Return a deep clone of `element` with fresh IDs for the element and every
 *  nested element (figure content, table cells, list children, etc.). */
export const duplicateElement = (element: DocumentElement): DocumentElement => {
    const newId = createId();
    switch (element.type) {
        case "Paragraph":
        case "Heading":
        case "Quote":
        case "Equation":
        case "Diagram":
        case "Custom":
            return { ...element, id: newId };
        case "List":
        case "Enumeration":
            return {
                ...element,
                id: newId,
                items: element.items.map(duplicateListItem),
            };
        case "Table":
            return {
                ...element,
                id: newId,
                cells: element.cells.map((row) => row.map(duplicateTableCell)),
            };
        case "Figure":
            return {
                ...element,
                id: newId,
                content: duplicateElement(element.content),
            };
        default:
            return element;
    }
};

const duplicateListItem = (item: ListItem): ListItem => ({
    ...item,
    content: item.content.map((span) => ({ ...span })),
    children: item.children.map(duplicateListItem),
});

const duplicateTableCell = (cell: TableCell): TableCell => ({
    ...cell,
    elements: cell.elements.map(duplicateElement),
});
