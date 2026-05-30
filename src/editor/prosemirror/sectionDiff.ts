import type { DocumentElement } from "../../bindings/DocumentElement";
import type { DocumentEvent } from "../../bindings/DocumentEvent";
import type { RichText } from "../../bindings/RichText";
import { richTextSignificantlyEqual } from "../../state/ast/commitPolicy";
import { diffTableElement } from "./tableDiff";

/**
 * Translate a content section's element list change (old AST elements → the
 * elements derived from the edited ProseMirror doc) into the fine-grained
 * `DocumentEvent`s the rest of the pipeline already understands.
 *
 * The result is a single forward/inverse pair so one ProseMirror transaction
 * becomes one undo entry. Element identity is matched by `id`, so an in-place
 * text edit stays an `updateParagraphContent`, an Enter-split becomes one
 * `insertElement`, and a Backspace-merge becomes `removeElement` + an update of
 * the survivor — all while every persisting element keeps its id (and therefore
 * its source-map continuity).
 *
 * The granular result is verified by replaying it; if it does not reproduce the
 * target (e.g. a reorder or multi-block paste the heuristic can't express), the
 * function falls back to a correct-by-construction full replace.
 */

export interface SectionEventDelta {
    forward: DocumentEvent[];
    inverse: DocumentEvent[];
}

const deepEqual = (a: unknown, b: unknown): boolean =>
    JSON.stringify(a) === JSON.stringify(b);

const restore = (
    sectionId: string,
    index: number,
    element: DocumentElement,
): DocumentEvent => ({
    type: "restoreElement",
    section_id: sectionId,
    index,
    element,
});

const insert = (
    sectionId: string,
    index: number,
    element: DocumentElement,
): DocumentEvent => ({
    type: "insertElement",
    section_id: sectionId,
    index,
    element,
});

const remove = (elementId: string): DocumentEvent => ({
    type: "removeElement",
    element_id: elementId,
});

const contentUpdate = (
    prevEl: DocumentElement,
    nextEl: DocumentElement,
): { forward: DocumentEvent; inverse: DocumentEvent } | null => {
    if (prevEl.type === "Paragraph" && nextEl.type === "Paragraph") {
        return {
            forward: {
                type: "updateParagraphContent",
                element_id: nextEl.id,
                content: nextEl.content,
            },
            inverse: {
                type: "updateParagraphContent",
                element_id: prevEl.id,
                content: prevEl.content,
            },
        };
    }
    if (prevEl.type === "Heading" && nextEl.type === "Heading") {
        return {
            forward: {
                type: "updateHeadingContent",
                element_id: nextEl.id,
                content: nextEl.content,
                level: nextEl.level,
            },
            inverse: {
                type: "updateHeadingContent",
                element_id: prevEl.id,
                content: prevEl.content,
                level: prevEl.level,
            },
        };
    }
    return null;
};

/** Minimal applier for exactly the event variants `diffSectionElements` emits. */
export const applyElementEvents = (
    elements: DocumentElement[],
    events: DocumentEvent[],
): DocumentElement[] => {
    let next = [...elements];
    for (const event of events) {
        switch (event.type) {
            case "removeElement":
                next = next.filter((el) => el.id !== event.element_id);
                break;
            case "insertElement":
            case "restoreElement":
                next.splice(event.index, 0, event.element);
                break;
            case "updateParagraphContent":
                next = next.map((el) =>
                    el.id === event.element_id && el.type === "Paragraph"
                        ? { ...el, content: event.content }
                        : el,
                );
                break;
            case "updateHeadingContent":
                next = next.map((el) =>
                    el.id === event.element_id && el.type === "Heading"
                        ? {
                              ...el,
                              content: event.content,
                              level: event.level ?? el.level,
                          }
                        : el,
                );
                break;
            case "updateTableCell":
                next = next.map((el) =>
                    el.id === event.table_id && el.type === "Table"
                        ? {
                              ...el,
                              cells: el.cells.map((row, rowIndex) =>
                                  rowIndex === event.row_index
                                      ? row.map((cell, colIndex) =>
                                            colIndex === event.col_index
                                                ? { ...cell, content: event.text }
                                                : cell,
                                        )
                                      : row,
                              ),
                          }
                        : el,
                );
                break;
            case "insertTableRow":
            case "restoreTableRow": {
                next = next.map((el) => {
                    if (el.id !== event.table_id || el.type !== "Table") {
                        return el;
                    }
                    const cells = [...el.cells];
                    cells.splice(event.row_index, 0, event.cells);
                    return { ...el, rows: cells.length, cells };
                });
                break;
            }
            case "removeTableRow":
                next = next.map((el) =>
                    el.id === event.table_id && el.type === "Table"
                        ? {
                              ...el,
                              rows: Math.max(0, el.rows - 1),
                              cells: el.cells.filter(
                                  (_, index) => index !== event.row_index,
                              ),
                          }
                        : el,
                );
                break;
            case "insertTableColumn":
            case "restoreTableColumn":
                next = next.map((el) => {
                    if (el.id !== event.table_id || el.type !== "Table") {
                        return el;
                    }
                    const columnSizes = [...el.column_sizes];
                    columnSizes.splice(event.col_index, 0, event.size);
                    return {
                        ...el,
                        cols: el.cols + 1,
                        column_sizes: columnSizes,
                        cells: el.cells.map((row, rowIndex) => {
                            const nextRow = [...row];
                            nextRow.splice(
                                event.col_index,
                                0,
                                event.cells[rowIndex] ?? { content: "", row_span: null, col_span: null },
                            );
                            return nextRow;
                        }),
                    };
                });
                break;
            case "removeTableColumn":
                next = next.map((el) =>
                    el.id === event.table_id && el.type === "Table"
                        ? {
                              ...el,
                              cols: Math.max(0, el.cols - 1),
                              column_sizes: el.column_sizes.filter(
                                  (_, index) => index !== event.col_index,
                              ),
                              cells: el.cells.map((row) =>
                                  row.filter((_, index) => index !== event.col_index),
                              ),
                          }
                        : el,
                );
                break;
            case "updateTableColumnSize":
                next = next.map((el) =>
                    el.id === event.table_id && el.type === "Table"
                        ? {
                              ...el,
                              column_sizes: el.column_sizes.map((size, index) =>
                                  index === event.col_index ? event.size : size,
                              ),
                          }
                        : el,
                );
                break;
            default:
                break;
        }
    }
    return next;
};

const fullReplace = (
    sectionId: string,
    prev: DocumentElement[],
    next: DocumentElement[],
): SectionEventDelta => ({
    forward: [
        ...prev.map((el) => remove(el.id)),
        ...next.map((el, index) => insert(sectionId, index, el)),
    ],
    inverse: [
        ...next.map((el) => remove(el.id)),
        ...prev.map((el, index) => restore(sectionId, index, el)),
    ],
});

const granularDelta = (
    sectionId: string,
    prev: DocumentElement[],
    next: DocumentElement[],
): SectionEventDelta => {
    const forward: DocumentEvent[] = [];
    const inverse: DocumentEvent[] = [];
    const pushPair = (fwd: DocumentEvent, inv: DocumentEvent) => {
        forward.push(fwd);
        inverse.unshift(inv); // build inverse in reverse application order
    };

    const prevById = new Map(prev.map((el, index) => [el.id, { el, index }]));
    const nextIds = new Set(next.map((el) => el.id));

    for (const { el, index } of prevById.values()) {
        if (!nextIds.has(el.id)) {
            pushPair(remove(el.id), restore(sectionId, index, el));
        }
    }

    next.forEach((nextEl, index) => {
        const prevEntry = prevById.get(nextEl.id);
        if (!prevEntry) {
            pushPair(insert(sectionId, index, nextEl), remove(nextEl.id));
            return;
        }
        const prevEl = prevEntry.el;
        if (deepEqual(prevEl, nextEl)) {
            return;
        }
        if (prevEl.type === nextEl.type) {
            if (prevEl.type === "Table" && nextEl.type === "Table") {
                const tableDelta = diffTableElement(prevEl, nextEl);
                if (tableDelta) {
                    for (let i = 0; i < tableDelta.forward.length; i += 1) {
                        pushPair(
                            tableDelta.forward[i]!,
                            tableDelta.inverse[i]!,
                        );
                    }
                    return;
                }
            }
            const specialized = contentUpdate(prevEl, nextEl);
            if (specialized) {
                pushPair(specialized.forward, specialized.inverse);
                return;
            }
        }
        // Type change or an element type without a dedicated content event:
        // replace it in place, keeping the id.
        pushPair(remove(nextEl.id), restore(sectionId, index, prevEl));
        pushPair(insert(sectionId, index, nextEl), remove(nextEl.id));
    });

    return { forward, inverse };
};

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

/**
 * Whether two element lists differ only insignificantly (e.g. trailing
 * whitespace in a text field). Mirrors the reducer's `commitPolicy` so the body
 * editor can keep such edits as a local PM draft without recompiling — the same
 * behavior the old `useDeferredRichTextCommit` provided per field.
 */
export const sectionSignificantlyEqual = (
    prev: DocumentElement[],
    next: DocumentElement[],
): boolean => {
    if (prev.length !== next.length) {
        return false;
    }
    for (let i = 0; i < prev.length; i += 1) {
        const a = prev[i];
        const b = next[i];
        if (a.id !== b.id || a.type !== b.type) {
            return false;
        }
        const aText = richTextOf(a);
        const bText = richTextOf(b);
        if (aText && bText) {
            if (!richTextSignificantlyEqual(aText, bText)) {
                return false;
            }
            continue;
        }
        if (!deepEqual(a, b)) {
            return false;
        }
    }
    return true;
};

export const diffSectionElements = (
    sectionId: string,
    prev: DocumentElement[],
    next: DocumentElement[],
): SectionEventDelta => {
    if (deepEqual(prev, next)) {
        return { forward: [], inverse: [] };
    }

    const granular = granularDelta(sectionId, prev, next);
    const forwardOk = deepEqual(applyElementEvents(prev, granular.forward), next);
    const inverseOk = deepEqual(applyElementEvents(next, granular.inverse), prev);
    if (forwardOk && inverseOk) {
        return granular;
    }

    return fullReplace(sectionId, prev, next);
};
