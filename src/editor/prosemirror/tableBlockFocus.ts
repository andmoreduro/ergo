import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorState } from "prosemirror-state";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { ATOM_BLOCK_NODES, TABLE_BLOCK_NODE } from "./schema";
import { isBlockEditing } from "./blockEditMode";

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
    if (isBlockEditing(state, elementId)) {
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
        return !isBlockEditing(state, elementId);
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
                    const name = node.type.name;
                    const isTable = name === TABLE_BLOCK_NODE;
                    const isAtom = ATOM_BLOCK_NODES.has(name);
                    if (!isTable && !isAtom) {
                        return;
                    }
                    const elementId = isAtom
                        ? ((node.attrs.element as { id?: string } | null)?.id ??
                          (node.attrs.elementId as string))
                        : (node.attrs.elementId as string);
                    const editing = isBlockEditing(state, elementId);
                    const selected =
                        selection instanceof NodeSelection &&
                        selection.from === pos;
                    const classes: string[] = [];
                    if (isTable) {
                        classes.push(
                            editing
                                ? "ergo-table-block--editing"
                                : "ergo-table-block--locked",
                        );
                        if (selected && !editing) {
                            classes.push("ergo-table-block-focus");
                        }
                    } else {
                        classes.push(
                            editing
                                ? "ergo-block-object--editing"
                                : "ergo-block-object--locked",
                        );
                        if (selected && !editing) {
                            classes.push("ergo-block-object--selected");
                        }
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
