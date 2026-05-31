import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { DocumentSection } from "../bindings/DocumentSection";
import type { ASTAction } from "../state/ast/actions";
import { astReducer } from "../state/ast/reducer";
import {
    ensureMinimumContentParagraphAction,
} from "../state/ast/contentInvariant";
import {
    defaultFieldIdForElement,
    diagramCaptionFieldId,
    diagramSourceFieldId,
    equationSourceFieldId,
    figureBodyFieldId,
    quoteContentFieldId,
    richTextFieldId,
} from "./fieldIds";
import { contentSection } from "./fieldNavigation";
import { richTextPlainLength } from "../richText/richText";

export { ensureMinimumContentParagraphAction } from "../state/ast/contentInvariant";

type ContentSection = Extract<DocumentSection, { type: "Content" }>;

export type ContentFocusTarget = {
    elementId: string;
    fieldId: string;
};

export type ContentElementRemovalPlan = {
    actions: ASTAction[];
    focus: ContentFocusTarget;
};

const focusTargetForElement = (element: DocumentElement): ContentFocusTarget => ({
    elementId: element.id,
    fieldId: defaultFieldIdForElement(element),
});

/** UTF-16 offset at the end of the focused field's editable text (for post-delete focus). */
export const caretOffsetAtEndForField = (
    ast: DocumentAST,
    elementId: string,
    fieldId: string,
): number => {
    const section = contentSection(ast);
    const element = section?.elements.find((entry) => entry.id === elementId);
    if (!element) {
        return 0;
    }

    if (fieldId === richTextFieldId(elementId)) {
        if (element.type === "Paragraph" || element.type === "Heading") {
            return richTextPlainLength(element.content);
        }
    }

    if (fieldId === quoteContentFieldId(elementId) && element.type === "Quote") {
        return richTextPlainLength(element.content);
    }

    if (fieldId === figureBodyFieldId(elementId) && element.type === "Figure") {
        if (element.content.type === "Paragraph") {
            return richTextPlainLength(element.content.content);
        }
    }

    if (fieldId === equationSourceFieldId(elementId) && element.type === "Equation") {
        return element.latex_source.length;
    }

    if (fieldId === diagramSourceFieldId(elementId) && element.type === "Diagram") {
        return element.mermaid_source.length;
    }

    if (fieldId === diagramCaptionFieldId(elementId) && element.type === "Diagram") {
        return element.caption.length;
    }

    const cellPrefix = `${elementId}:cell:`;
    if (fieldId.startsWith(cellPrefix) && element.type === "Table") {
        const parts = fieldId.slice(cellPrefix.length).split(":");
        const rowIndex = Number(parts[0]);
        const colIndex = Number(parts[1]);
        const cell = element.cells[rowIndex]?.[colIndex];
        if (cell) {
            return cell.content.length;
        }
    }

    const itemPrefix = `${elementId}:item:`;
    if (
        fieldId.startsWith(itemPrefix) &&
        (element.type === "List" || element.type === "Enumeration")
    ) {
        const itemIndex = Number(fieldId.slice(itemPrefix.length));
        const item = element.items[itemIndex];
        if (item) {
            return richTextPlainLength(item);
        }
    }

    return 0;
};

const lastParagraphInSection = (
    section: ContentSection,
): DocumentElement | null => {
    for (let index = section.elements.length - 1; index >= 0; index -= 1) {
        const element = section.elements[index];
        if (element.type === "Paragraph") {
            return element;
        }
    }
    return null;
};

/**
 * After removing a content element: focus the previous block, else the next one.
 * If no blocks remain, insert an empty paragraph and focus it.
 */
export const planContentElementRemoval = (
    ast: DocumentAST,
    elementId: string,
): ContentElementRemovalPlan | null => {
    const section = contentSection(ast);
    if (!section) {
        return null;
    }

    const removedIndex = section.elements.findIndex(
        (element) => element.id === elementId,
    );
    if (removedIndex === -1) {
        return null;
    }

    const actions: ASTAction[] = [
        {
            type: "REMOVE_ELEMENT",
            payload: { elementId },
        },
    ];

    const remaining = section.elements.filter(
        (element) => element.id !== elementId,
    );
    let focusElement =
        remaining[removedIndex - 1] ?? remaining[removedIndex] ?? null;

    let nextAst = astReducer(ast, actions[0]);
    const paragraphAction = ensureMinimumContentParagraphAction(nextAst);
    if (paragraphAction) {
        actions.push(paragraphAction);
        nextAst = astReducer(nextAst, paragraphAction);
    }

    const nextSection = contentSection(nextAst);
    if (!nextSection) {
        return null;
    }

    if (!focusElement) {
        focusElement =
            lastParagraphInSection(nextSection) ??
            nextSection.elements[nextSection.elements.length - 1] ??
            null;
    }

    if (!focusElement) {
        return null;
    }

    return {
        actions,
        focus: focusTargetForElement(focusElement),
    };
};

export const applyAstActions = (
    ast: DocumentAST,
    actions: ASTAction[],
): DocumentAST =>
    actions.reduce((current, action) => astReducer(current, action), ast);
