import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { TABLE_BLOCK_NODE } from "./schema";
import { isTableEditing } from "./tableEditMode";

export interface TableBlockGapFocus {
    elementId: string;
    tablePos: number;
}

/** Doc-level gap immediately before a locked `table_block`. */
export const tableBlockGapFocus = (
    state: EditorState,
): TableBlockGapFocus | null => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.empty) {
        return null;
    }
    const $from = selection.$from;
    if ($from.parent.type.name !== "doc") {
        return null;
    }
    const block = $from.nodeAfter;
    if (!block || block.type.name !== TABLE_BLOCK_NODE) {
        return null;
    }
    const elementId = block.attrs.elementId as string;
    if (isTableEditing(state, elementId)) {
        return null;
    }
    return { elementId, tablePos: $from.pos };
};

/** Whole-table focus: `NodeSelection` on the wrapper, or a doc gap before it. */
export const isTableBlockFocused = (state: EditorState): boolean => {
    const { selection } = state;
    if (selection instanceof NodeSelection) {
        if (selection.node.type.name !== TABLE_BLOCK_NODE) {
            return false;
        }
        const elementId = selection.node.attrs.elementId as string;
        return !isTableEditing(state, elementId);
    }
    return tableBlockGapFocus(state) !== null;
};

export const tableBlockFocusPlugin = () =>
    new Plugin({
        props: {
            decorations(state) {
                const { selection } = state;
                const decorations: Decoration[] = [];

                state.doc.descendants((node, pos) => {
                    if (node.type.name !== TABLE_BLOCK_NODE) {
                        return;
                    }
                    const elementId = node.attrs.elementId as string;
                    const editing = isTableEditing(state, elementId);
                    const classes: string[] = [];
                    if (editing) {
                        classes.push("ergo-table-block--editing");
                    } else {
                        classes.push("ergo-table-block--locked");
                    }
                    const nodeSelected =
                        selection instanceof NodeSelection &&
                        selection.from === pos &&
                        selection.node.type.name === TABLE_BLOCK_NODE;
                    if (nodeSelected) {
                        classes.push("ergo-table-block-focus");
                    }
                    decorations.push(
                        Decoration.node(pos, pos + node.nodeSize, {
                            class: classes.join(" "),
                        }),
                    );
                });

                if (decorations.length === 0) {
                    return null;
                }
                return DecorationSet.create(state.doc, decorations);
            },
        },
    });
