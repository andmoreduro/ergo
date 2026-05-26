import { collapseConsecutiveSpaces } from "../../editor/textInput";
import type { DocumentAST } from "../../bindings/DocumentAST";
import type { RichText } from "../../bindings/RichText";
import type { ASTAction } from "./actions";
import {
    elementById,
    equationElement,
    figureElement,
    getValueAtPath,
    headingElement,
    paragraphElement,
    richTextPlainText,
    tableCell,
    tableElement,
} from "../documentEvents/helpers";

/**
 * Compare text for whether a document event would change compiled output.
 * Leading and trailing whitespace are ignored; internal spacing is preserved.
 */
export const textSignificantlyEqual = (left: string, right: string): boolean =>
    collapseConsecutiveSpaces(left).trim() ===
    collapseConsecutiveSpaces(right).trim();

export const richTextSignificantlyEqual = (
    left: RichText[],
    right: RichText[],
): boolean => textSignificantlyEqual(richTextPlainText(left), richTextPlainText(right));

export const parentFigureIdForParagraph = (
    ast: DocumentAST,
    paragraphId: string,
): string | null => {
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }

        for (const element of section.elements) {
            if (
                element.type === "Figure" &&
                element.content.type === "Paragraph" &&
                element.content.id === paragraphId
            ) {
                return element.id;
            }
        }
    }

    return null;
};

export const figureHasLinkedAsset = (assetId: string | null | undefined): boolean =>
    Boolean(assetId?.trim());

const figureBlocksCompileEdits = (ast: DocumentAST, figureId: string): boolean => {
    try {
        const figure = figureElement(ast, figureId);
        return !figureHasLinkedAsset(figure.asset_id);
    } catch {
        return false;
    }
};

const extraFieldBlocksCompile = (
    ast: DocumentAST,
    elementId: string,
): boolean => {
    if (figureBlocksCompileEdits(ast, elementId)) {
        return true;
    }

    const parentFigureId = parentFigureIdForParagraph(ast, elementId);
    return parentFigureId !== null && figureBlocksCompileEdits(ast, parentFigureId);
};

/**
 * Returns false when applying the action would not change compiled output (or would
 * compile before a figure has its required image).
 */
export const shouldCommitAstAction = (
    ast: DocumentAST,
    action: ASTAction,
    nextAst: DocumentAST,
): boolean => {
    switch (action.type) {
        case "UPDATE_EQUATION": {
            const previous = equationElement(ast, action.payload.equationId);
            if (action.payload.latexSource !== undefined) {
                return !textSignificantlyEqual(
                    previous.latex_source,
                    action.payload.latexSource,
                );
            }
            if (action.payload.isBlock !== undefined) {
                return action.payload.isBlock !== previous.is_block;
            }
            return false;
        }

        case "UPDATE_PARAGRAPH_CONTENT": {
            if (extraFieldBlocksCompile(ast, action.payload.paragraphId)) {
                return false;
            }

            const previous = paragraphElement(ast, action.payload.paragraphId);
            const next = paragraphElement(nextAst, action.payload.paragraphId);
            return !richTextSignificantlyEqual(previous.content, next.content);
        }

        case "UPDATE_PARAGRAPH_TEXT": {
            if (extraFieldBlocksCompile(ast, action.payload.paragraphId)) {
                return false;
            }

            const previous = paragraphElement(ast, action.payload.paragraphId);
            return !textSignificantlyEqual(
                richTextPlainText(previous.content),
                action.payload.text,
            );
        }

        case "UPDATE_HEADING_CONTENT": {
            const previous = headingElement(ast, action.payload.headingId);
            const next = headingElement(nextAst, action.payload.headingId);
            return !richTextSignificantlyEqual(previous.content, next.content);
        }

        case "UPDATE_HEADING": {
            if (action.payload.text === undefined) {
                return true;
            }
            const previous = headingElement(ast, action.payload.headingId);
            return !textSignificantlyEqual(
                richTextPlainText(previous.content),
                action.payload.text,
            );
        }

        case "UPDATE_TABLE_CELL": {
            const table = tableElement(ast, action.payload.tableId);
            const cell = tableCell(
                table,
                action.payload.rowIndex,
                action.payload.colIndex,
            );
            return !textSignificantlyEqual(cell.content, action.payload.text);
        }

        case "UPDATE_FIGURE": {
            const { figureId, assetId, caption, bodyText, placement } =
                action.payload;

            if (assetId !== undefined) {
                return true;
            }

            if (figureBlocksCompileEdits(ast, figureId)) {
                return false;
            }

            const previous = figureElement(ast, figureId);

            if (
                caption !== undefined &&
                !textSignificantlyEqual(previous.caption, caption)
            ) {
                return true;
            }

            if (placement !== undefined && placement !== previous.placement) {
                return true;
            }

            if (bodyText !== undefined) {
                const previousBody =
                    previous.content.type === "Paragraph"
                        ? richTextPlainText(previous.content.content)
                        : "";
                return !textSignificantlyEqual(previousBody, bodyText);
            }

            return false;
        }

        case "UPDATE_INPUT": {
            const pathParts = action.payload.path.split("/").filter(Boolean);
            const previous = getValueAtPath(ast.inputs, pathParts);
            const next = action.payload.value;
            const previousText =
                typeof previous === "string"
                    ? previous
                    : previous === undefined || previous === null
                      ? ""
                      : JSON.stringify(previous);
            const nextText =
                typeof next === "string"
                    ? next
                    : next === undefined || next === null
                      ? ""
                      : JSON.stringify(next);
            return !textSignificantlyEqual(previousText, nextText);
        }

        case "UPDATE_CUSTOM_ELEMENT_FIELD": {
            const element = elementById(ast, action.payload.elementId);
            if (element.type !== "Custom") {
                return true;
            }
            const previous = element.fields[action.payload.field];
            const previousText =
                typeof previous === "string"
                    ? previous
                    : previous === undefined || previous === null
                      ? ""
                      : JSON.stringify(previous);
            const next = action.payload.value;
            const nextText =
                typeof next === "string"
                    ? next
                    : next === undefined || next === null
                      ? ""
                      : JSON.stringify(next);
            return !textSignificantlyEqual(previousText, nextText);
        }

        case "UPDATE_ELEMENT_EXTRA_FIELD": {
            if (extraFieldBlocksCompile(ast, action.payload.elementId)) {
                return false;
            }

            let previousRaw: unknown;
            try {
                previousRaw =
                    figureElement(ast, action.payload.elementId).extra_fields?.[
                        action.payload.fieldKey
                    ];
            } catch {
                previousRaw =
                    tableElement(ast, action.payload.elementId).extra_fields?.[
                        action.payload.fieldKey
                    ];
            }

            const previous =
                typeof previousRaw === "string"
                    ? previousRaw
                    : previousRaw === undefined || previousRaw === null
                      ? ""
                      : JSON.stringify(previousRaw);
            const next =
                typeof action.payload.fieldValue === "string"
                    ? action.payload.fieldValue
                    : action.payload.fieldValue === null
                      ? ""
                      : JSON.stringify(action.payload.fieldValue);

            return !textSignificantlyEqual(previous, next);
        }

        default:
            return true;
    }
};
