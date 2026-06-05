import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { RichText } from "../bindings/RichText";
import type { ASTAction } from "../state/ast/actions";
import {
    figureBodyFieldId,
    figureCaptionFieldId,
    richTextFieldId,
} from "./fieldIds";
import {
    insertReferenceAtOffset,
    insertTextAtCaret,
    labelForReferenceId,
    richTextPlainLength,
} from "../richText/richText";
import { updateTableCellRichTextAtField } from "./prosemirror/table/tableCellElements";
import { locateTableCell } from "./prosemirror/table/tableCellResolve";

export type ReferenceInsertTarget = {
    referenceId: string;
    label: string;
};

export type ReferenceInsertSelection = {
    elementId: string;
    fieldId: string;
};

const isRichTextField = (fieldId: string): boolean =>
    fieldId.endsWith(":text") || fieldId.endsWith(":body");

const findElementById = (
    state: DocumentAST,
    elementId: string,
): DocumentElement | null => {
    for (const section of state.sections) {
        if (section.type !== "Content") {
            continue;
        }

        const element = section.elements.find((entry) => entry.id === elementId);
        if (element) {
            return element;
        }
    }

    return null;
};

const richTextContentForField = (
    element: DocumentElement,
    fieldId: string,
): RichText[] | null => {
    if (fieldId === richTextFieldId(element.id)) {
        if (element.type === "Paragraph" || element.type === "Heading") {
            return element.content;
        }
        return null;
    }

    if (element.type === "Figure" && fieldId === figureBodyFieldId(element.id)) {
        return element.content.type === "Paragraph" ? element.content.content : null;
    }

    return null;
};

export const buildReferenceInsertAction = (
    state: DocumentAST,
    selection: ReferenceInsertSelection,
    target: ReferenceInsertTarget,
    caretOffset: number | null,
): ASTAction | null => {
    const { elementId, fieldId } = selection;

    if (elementId === "project" && fieldId.startsWith("project-input-")) {
        const path = fieldId.slice("project-input-".length);
        const currentValue = readInputValue(state, path);
        if (typeof currentValue !== "string") {
            return null;
        }

        const token = `@${labelForReferenceId(target.referenceId)}`;
        const { nextValue } = insertTextAtCaret(currentValue, caretOffset, token);
        return {
            type: "UPDATE_INPUT",
            payload: { path, value: nextValue },
        };
    }

    const tableLocated = locateTableCell(state, elementId, fieldId);
    if (tableLocated && fieldId) {
        const cell = tableLocated.table.cells[tableLocated.row]?.[tableLocated.col];
        if (cell) {
            const innerElementId = fieldId.includes(":item:")
                ? (fieldId.split(":item:")[0] ?? elementId)
                : fieldId.endsWith(":text")
                  ? fieldId.slice(0, -":text".length)
                  : fieldId.endsWith(":quote")
                    ? fieldId.slice(0, -":quote".length)
                    : elementId;
            const nextCell = updateTableCellRichTextAtField(
                cell,
                innerElementId,
                fieldId,
                caretOffset,
                (content, localOffset) =>
                    insertReferenceAtOffset(
                        content,
                        localOffset,
                        target.referenceId,
                        target.label,
                    ),
            );
            return {
                type: "UPDATE_TABLE_CELL",
                payload: {
                    tableId: tableLocated.table.id,
                    rowIndex: tableLocated.row,
                    colIndex: tableLocated.col,
                    elements: nextCell.elements,
                },
            };
        }
    }

    const element = findElementById(state, elementId);
    if (!element) {
        return null;
    }

    if (isRichTextField(fieldId)) {
        const content = richTextContentForField(element, fieldId);
        if (!content) {
            return null;
        }

        const nextContent = insertReferenceAtOffset(
            content,
            caretOffset ?? richTextPlainLength(content),
            target.referenceId,
            target.label,
        );

        if (element.type === "Paragraph" && fieldId === richTextFieldId(element.id)) {
            return {
                type: "UPDATE_PARAGRAPH_CONTENT",
                payload: {
                    paragraphId: element.id,
                    content: nextContent,
                },
            };
        }

        if (element.type === "Heading" && fieldId === richTextFieldId(element.id)) {
            return {
                type: "UPDATE_HEADING_CONTENT",
                payload: {
                    headingId: element.id,
                    content: nextContent,
                },
            };
        }

        if (
            element.type === "Figure" &&
            fieldId === figureBodyFieldId(element.id) &&
            element.content.type === "Paragraph"
        ) {
            return {
                type: "UPDATE_PARAGRAPH_CONTENT",
                payload: {
                    paragraphId: element.content.id,
                    content: nextContent,
                },
            };
        }
    }

    if (fieldId === figureCaptionFieldId(element.id) && element.type === "Figure") {
        const token = `@${labelForReferenceId(target.referenceId)}`;
        const { nextValue } = insertTextAtCaret(
            element.caption,
            caretOffset,
            token,
        );
        return {
            type: "UPDATE_FIGURE",
            payload: {
                figureId: element.id,
                caption: nextValue,
            },
        };
    }

    return null;
};

const readInputValue = (state: DocumentAST, path: string): unknown => {
    const parts = path.split("/").filter(Boolean);
    let current: unknown = state.inputs;
    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (Array.isArray(current)) {
            const index = Number.parseInt(part, 10);
            current = current[index];
            continue;
        }
        if (typeof current === "object") {
            current = (current as Record<string, unknown>)[part];
        }
    }
    return current;
};
