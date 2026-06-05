import type { EditorState } from "prosemirror-state";

export type TopLevelTextBlock =
    | { kind: "paragraph"; elementId: string }
    | { kind: "heading"; elementId: string; level: number };

/**
 * The top-level paragraph or heading block containing the selection, if any.
 * Ignores paragraphs inside lists, quotes, and table cells.
 */
export const topLevelTextBlockAtSelection = (
    state: EditorState,
): TopLevelTextBlock | null => {
    const { $from } = state.selection;
    if ($from.depth !== 1) {
        return null;
    }

    const parent = $from.parent;
    const elementId = parent.attrs.elementId as string;
    if (!elementId) {
        return null;
    }

    if (parent.type.name === "paragraph") {
        return { kind: "paragraph", elementId };
    }

    if (parent.type.name === "heading") {
        const level = parent.attrs.level;
        return {
            kind: "heading",
            elementId,
            level: typeof level === "number" ? level : 1,
        };
    }

    return null;
};
