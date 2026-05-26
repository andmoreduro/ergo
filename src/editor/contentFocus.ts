import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { DocumentSection } from "../bindings/DocumentSection";
import type { ASTAction } from "../state/ast/actions";
import { astReducer } from "../state/ast/reducer";
import {
    ensureMinimumContentParagraphAction,
} from "../state/ast/contentInvariant";
import { defaultFieldIdForElement, projectInputElementId } from "./fieldIds";
import { contentSection } from "./fieldNavigation";

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

export const isProjectInputFocus = (elementId: string | null): boolean =>
    elementId === projectInputElementId;

const focusTargetForElement = (element: DocumentElement): ContentFocusTarget => ({
    elementId: element.id,
    fieldId: defaultFieldIdForElement(element),
});

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
