import type { ActionHandlerMap } from "../actions/runtime";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { ASTAction } from "../state/ast/actions";
import type { ConvertibleElementKind } from "../state/ast/convertElement";

/**
 * The five `editor::ConvertTo*` actions are bound to Ctrl+Alt+1..5
 * (context: element && !input) but previously had no handlers. Each converts
 * the focused content element to the target kind via the existing
 * CONVERT_ELEMENT reducer action, preserving the element id so labels,
 * references, and source maps stay valid.
 *
 * The target kind is implicit in the action id (no payload), so this is a
 * fixed mapping rather than a payload parse.
 */
const CONVERT_TO_KIND: Partial<Record<string, ConvertibleElementKind>> = {
    "editor::ConvertToParagraph": "Paragraph",
    "editor::ConvertToHeading": "Heading",
    "editor::ConvertToTable": "Table",
    "editor::ConvertToEquation": "Equation",
    "editor::ConvertToFigure": "Figure",
};

/**
 * Build the ConvertTo* handler map. Injecting the focused-element lookup and
 * the AST dispatcher keeps this testable without mounting the editor.
 */
export const convertToHandlers = (
    getFocusedElement: () => DocumentElement | null,
    dispatchAst: (action: ASTAction) => void,
): ActionHandlerMap => {
    const handlers: ActionHandlerMap = {};
    for (const [actionId, targetKind] of Object.entries(CONVERT_TO_KIND)) {
        if (!targetKind) continue;
        handlers[actionId as keyof ActionHandlerMap] = () => {
            const focused = getFocusedElement();
            if (!focused) {
                return false;
            }
            dispatchAst({
                type: "CONVERT_ELEMENT",
                payload: { elementId: focused.id, targetKind },
            });
            return true;
        };
    }
    return handlers;
};
