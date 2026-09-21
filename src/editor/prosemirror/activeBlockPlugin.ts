import { Plugin, PluginKey, type EditorState, type Selection } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { Decoration, DecorationSet } from "prosemirror-view";

/** Class on the top-level block(s) holding the selection. */
export const ACTIVE_BLOCK_CLASS = "ergo-active-block";

export const activeBlockPluginKey = new PluginKey<DecorationSet>("ergo-active-block");

/**
 * Top-level block ranges `[from, to)` touched by a selection. A text selection
 * resolves to its depth-1 ancestor; a node selection of a top-level block is
 * the block itself.
 */
export const activeBlockRanges = (
    doc: PMNode,
    selection: Selection,
): Array<[number, number]> => {
    const ranges = new Map<number, [number, number]>();
    const add = (pos: number, edge: "from" | "to") => {
        const $pos = doc.resolve(pos);
        if ($pos.depth >= 1) {
            ranges.set($pos.before(1), [$pos.before(1), $pos.after(1)]);
            return;
        }
        // A depth-0 position sits between top-level blocks: the selection's
        // start belongs to the block after it, its end to the block before it.
        const index = edge === "from" ? $pos.index(0) : $pos.index(0) - 1;
        if (index < 0 || index >= doc.childCount) {
            return;
        }
        let start = 0;
        for (let child = 0; child < index; child += 1) {
            start += doc.child(child).nodeSize;
        }
        ranges.set(start, [start, start + doc.child(index).nodeSize]);
    };
    add(selection.from, "from");
    add(selection.to, "to");
    return [...ranges.values()];
};

const decorationsFor = (doc: PMNode, selection: Selection): DecorationSet =>
    DecorationSet.create(
        doc,
        activeBlockRanges(doc, selection).map(([from, to]) =>
            Decoration.node(from, to, { class: ACTIVE_BLOCK_CLASS }),
        ),
    );

/**
 * Keeps the block(s) holding the selection out of off-screen virtualization
 * (`content-visibility: auto` skips layout of blocks that are not on screen).
 * Caret placement, find navigation and `scrollIntoView` measure the selected
 * block's real geometry, so it must always be laid out; the CSS exempts
 * `.ergo-active-block` from the skip.
 */
export const activeBlockPlugin = () =>
    new Plugin<DecorationSet>({
        key: activeBlockPluginKey,
        state: {
            init: (_config, state: EditorState) =>
                decorationsFor(state.doc, state.selection),
            apply: (tr, previous, _old, next) =>
                tr.docChanged || tr.selectionSet
                    ? decorationsFor(next.doc, next.selection)
                    : previous,
        },
        props: {
            decorations: (state) => activeBlockPluginKey.getState(state) ?? null,
        },
    });
