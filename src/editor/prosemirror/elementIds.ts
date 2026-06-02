import type { DocumentElement } from "../../bindings/DocumentElement";
import { createId } from "../../state/ast/defaults";

/** Diagram ids carry a `diagram-` prefix (see `insertElement`); keep it. */
const freshId = (previous: string): string =>
    previous.startsWith("diagram-") ? `diagram-${createId()}` : createId();

/**
 * Deep-clone an element with a fresh id for it and every nested element (a
 * figure's body, a table's cells). Reference ids and asset ids are left intact —
 * they point at bibliography entries and stored assets, not document elements.
 *
 * Used on paste so a duplicated block never shares an identity with its source,
 * which would break labels, references, and the source map.
 */
export const regenerateElementIds = (
    element: DocumentElement,
    id: string = freshId(element.id),
): DocumentElement => {
    switch (element.type) {
        case "Figure":
            return {
                ...element,
                id,
                content: regenerateElementIds(element.content),
            };
        case "Table":
            return {
                ...element,
                id,
                cells: element.cells.map((row) =>
                    row.map((cell) => ({
                        ...cell,
                        elements: cell.elements.map((child) =>
                            regenerateElementIds(child),
                        ),
                    })),
                ),
            };
        default:
            return { ...element, id };
    }
};
