import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { bodySchema } from "./schema";
import {
    ACTIVE_BLOCK_CLASS,
    activeBlockPlugin,
    activeBlockPluginKey,
    activeBlockRanges,
} from "./activeBlockPlugin";

const paragraph = (text: string) =>
    bodySchema.node("paragraph", { elementId: `p-${text}` }, bodySchema.text(text));

const doc = bodySchema.node("doc", null, [paragraph("aaa"), paragraph("bbb"), paragraph("ccc")]);
// Block offsets: p1 [0,5), p2 [5,10), p3 [10,15).

describe("activeBlockRanges", () => {
    it("resolves a caret to its top-level block and a range to both ends' blocks", () => {
        expect(activeBlockRanges(doc, TextSelection.create(doc, 7))).toEqual([[5, 10]]);
        expect(activeBlockRanges(doc, TextSelection.create(doc, 2, 12))).toEqual([
            [0, 5],
            [10, 15],
        ]);
    });

    it("keeps a node-selected top-level block", () => {
        expect(activeBlockRanges(doc, NodeSelection.create(doc, 5))).toEqual([[5, 10]]);
    });
});

describe("activeBlockPlugin", () => {
    it("decorates the selected block and follows selection changes", () => {
        let state = EditorState.create({ doc, plugins: [activeBlockPlugin()] });
        const decorated = (current: EditorState) =>
            activeBlockPluginKey
                .getState(current)!
                .find()
                .map((decoration) => [decoration.from, decoration.to]);

        expect(decorated(state)).toEqual([[0, 5]]);
        const first = activeBlockPluginKey.getState(state)!.find()[0] as unknown as {
            type: { attrs: { class: string } };
        };
        expect(first.type.attrs.class).toBe(ACTIVE_BLOCK_CLASS);

        state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 12)));
        expect(decorated(state)).toEqual([[10, 15]]);
    });
});
