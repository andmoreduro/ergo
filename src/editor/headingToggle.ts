import type { ASTAction } from "../state/ast/actions";
import { clampHeadingLevel } from "./headingLevels";
import { getActiveBodyView } from "./prosemirror/activeView";
import { topLevelTextBlockAtSelection } from "./prosemirror/topLevelTextBlock";

/**
 * Apply a heading-level shortcut to the block under the caret:
 * - top-level paragraph → heading at `level`
 * - heading at the same level → paragraph
 * - heading at a different level → update level
 *
 * Returns false when the caret is not in a convertible top-level block.
 */
export const tryApplyHeadingLevelToCurrentBlock = (
    level: number,
    dispatch: (action: ASTAction) => void,
): boolean => {
    const view = getActiveBodyView();
    if (!view) {
        return false;
    }

    const block = topLevelTextBlockAtSelection(view.state);
    if (!block) {
        return false;
    }

    const clampedLevel = clampHeadingLevel(level);

    if (block.kind === "paragraph") {
        dispatch({
            type: "CONVERT_ELEMENT",
            payload: {
                elementId: block.elementId,
                targetKind: "Heading",
                headingLevel: clampedLevel,
            },
        });
        return true;
    }

    if (block.level === clampedLevel) {
        dispatch({
            type: "CONVERT_ELEMENT",
            payload: {
                elementId: block.elementId,
                targetKind: "Paragraph",
            },
        });
        return true;
    }

    dispatch({
        type: "UPDATE_HEADING",
        payload: {
            headingId: block.elementId,
            level: clampedLevel,
        },
    });
    return true;
};
