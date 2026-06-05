import { describe, expect, it } from "vitest";
import {
    AllSelection,
    EditorState,
    NodeSelection,
    TextSelection,
    type Transaction,
} from "prosemirror-state";
import type { ContentSection } from "../../bindings/ContentSection";
import { createRichText } from "../../state/ast/defaults";
import { sectionToDoc } from "./astBridge";
import { bodySchema } from "./schema";
import {
    blockIndexAtPos,
    clearElementSelection,
    extendBlockSelection,
    isBlockLevelTextSelection,
    isExtendingTextSelection,
    isBlockSelectionHighlighted,
    selectionCoversWholeBlocks,
    selectBlockRange,
    selectCurrentElement,
    selectCurrentOrAllElements,
    textSelectionHeadAtBlockEdge,
    wholeBlockSelectionAtIndex,
} from "./bodySelection";

const section: ContentSection = {
    id: "s1",
    is_optional: false,
    elements: [
        { type: "Heading", id: "h1", level: 1, content: [createRichText("Title")] },
        { type: "Paragraph", id: "p1", content: [createRichText("hello")] },
        {
            type: "Equation",
            id: "eq1",
            latex_source: "x^2",
            is_block: true,
            syntax: "latex",
        },
    ],
};

const stateWithCaretIn = (elementIndex: number) => {
    const doc = sectionToDoc(bodySchema, section);
    // +1 lands just inside the block's content.
    let pos = 1;
    for (let i = 0; i < elementIndex; i += 1) {
        pos += doc.child(i).nodeSize;
    }
    return EditorState.create({
        doc,
        selection: TextSelection.create(doc, pos),
    });
};

/** Run a command, applying the transaction it dispatches. */
const run = (
    state: EditorState,
    command: (
        state: EditorState,
        dispatch?: (tr: Transaction) => void,
    ) => boolean,
): EditorState => {
    let next = state;
    command(state, (tr) => {
        next = state.apply(tr);
    });
    return next;
};

describe("selectCurrentElement", () => {
    it("node-selects the top-level element of a caret", () => {
        const next = run(stateWithCaretIn(1), selectCurrentElement);
        expect(next.selection).toBeInstanceOf(NodeSelection);
        const selected = (next.selection as NodeSelection).node;
        expect(selected.attrs.elementId).toBe("p1");
    });

    it("is a no-op when the element is already node-selected", () => {
        const selected = run(stateWithCaretIn(1), selectCurrentElement);
        expect(selectCurrentElement(selected, undefined)).toBe(false);
    });
});

describe("selectCurrentOrAllElements", () => {
    it("first selects the current element, then escalates to all", () => {
        const first = run(stateWithCaretIn(0), selectCurrentOrAllElements);
        expect(first.selection).toBeInstanceOf(NodeSelection);
        expect((first.selection as NodeSelection).node.attrs.elementId).toBe("h1");

        const second = run(first, selectCurrentOrAllElements);
        expect(second.selection).toBeInstanceOf(AllSelection);
    });

    it("escalates from an atom node selection straight to all", () => {
        const caret = stateWithCaretIn(1);
        // Node-select the atom (third block).
        const doc = caret.doc;
        let atomPos = 0;
        for (let i = 0; i < 2; i += 1) {
            atomPos += doc.child(i).nodeSize;
        }
        const atomSelected = caret.apply(
            caret.tr.setSelection(NodeSelection.create(doc, atomPos)),
        );
        const next = run(atomSelected, selectCurrentOrAllElements);
        expect(next.selection).toBeInstanceOf(AllSelection);
    });
});

describe("isBlockLevelTextSelection", () => {
    it("is false for a partial in-block range", () => {
        const state = stateWithCaretIn(1);
        const block = state.doc.child(1);
        const from = 1 + state.doc.child(0).nodeSize + 1;
        const partial = state.apply(
            state.tr.setSelection(
                TextSelection.create(state.doc, from, from + 3),
            ),
        );
        expect(isBlockLevelTextSelection(partial)).toBe(false);
    });

    it("is true once the whole text block is covered", () => {
        const state = stateWithCaretIn(1);
        const whole = state.apply(
            state.tr.setSelection(
                wholeBlockSelectionAtIndex(state.doc, 1),
            ),
        );
        expect(isBlockLevelTextSelection(whole)).toBe(true);
    });

    it("is false when the range only partially crosses into the next block", () => {
        const state = stateWithCaretIn(0);
        const headingSize = state.doc.child(0).nodeSize;
        const paragraphInnerStart = 1 + headingSize + 1;
        const crossBlock = state.apply(
            state.tr.setSelection(
                TextSelection.create(
                    state.doc,
                    1 + 1,
                    paragraphInnerStart + 2,
                ),
            ),
        );
        expect(selectionCoversWholeBlocks(crossBlock, 0, 1)).toBe(false);
        expect(isBlockLevelTextSelection(crossBlock)).toBe(false);
    });

    it("is true when every spanned block is fully covered", () => {
        const state = stateWithCaretIn(0);
        const applied = state.apply(
            state.tr.setSelection(selectBlockRange(state, 0, 1)),
        );
        expect(selectionCoversWholeBlocks(applied, 0, 1)).toBe(true);
        expect(isBlockLevelTextSelection(applied)).toBe(true);
    });
});

describe("textSelectionHeadAtBlockEdge", () => {
    it("detects the moving end within a partial range", () => {
        const state = stateWithCaretIn(1);
        const from = 1 + state.doc.child(0).nodeSize + 1;
        const partial = state.apply(
            state.tr.setSelection(
                TextSelection.create(state.doc, from, from + 3),
            ),
        );
        expect(textSelectionHeadAtBlockEdge(partial, 1)).toBe(false);
        expect(textSelectionHeadAtBlockEdge(partial, -1)).toBe(false);
    });
});

describe("isExtendingTextSelection", () => {
    it("treats a collapsed caret as extending in either direction", () => {
        const state = stateWithCaretIn(1);
        expect(isExtendingTextSelection(state, 1)).toBe(true);
        expect(isExtendingTextSelection(state, -1)).toBe(true);
    });

    it("detects shrinking when shift moves the head toward the anchor", () => {
        const state = stateWithCaretIn(1);
        const block = state.doc.child(1);
        const from = 1 + state.doc.child(0).nodeSize + 1;
        const to = from + block.content.size;
        const forward = state.apply(
            state.tr.setSelection(TextSelection.create(state.doc, from, to)),
        );
        expect(isExtendingTextSelection(forward, -1)).toBe(false);
        expect(isExtendingTextSelection(forward, 1)).toBe(true);

        const backward = state.apply(
            state.tr.setSelection(TextSelection.create(state.doc, to, from)),
        );
        expect(isExtendingTextSelection(backward, 1)).toBe(false);
        expect(isExtendingTextSelection(backward, -1)).toBe(true);
    });
});

describe("extendBlockSelection", () => {
    const atomPos = () => {
        const doc = sectionToDoc(bodySchema, section);
        let pos = 0;
        for (let i = 0; i < 2; i += 1) {
            pos += doc.child(i).nodeSize;
        }
        return pos;
    };

    it("returns null when the key would shrink the selection", () => {
        const state = stateWithCaretIn(1);
        const from = 1 + state.doc.child(0).nodeSize + 1;
        const to = from + state.doc.child(1).content.size;
        const forward = state.apply(
            state.tr.setSelection(TextSelection.create(state.doc, from, to)),
        );
        expect(extendBlockSelection(forward, -1)).toBeNull();
    });

    it("first press selects only the current element", () => {
        const state = stateWithCaretIn(1);
        const next = extendBlockSelection(state, 1);
        expect(next).not.toBeNull();
        const applied = state.apply(state.tr.setSelection(next!));
        // The paragraph is covered; the following equation is not yet.
        expect(
            isBlockSelectionHighlighted(applied.selection, atomPos(), 1),
        ).toBe(false);
        expect(applied.selection.empty).toBe(false);
    });

    it("grows one element per press toward the equation", () => {
        let state = stateWithCaretIn(1);
        state = state.apply(
            state.tr.setSelection(extendBlockSelection(state, 1)!),
        );
        state = state.apply(
            state.tr.setSelection(extendBlockSelection(state, 1)!),
        );
        expect(
            isBlockSelectionHighlighted(state.selection, atomPos(), 1),
        ).toBe(true);
    });

    it("returns null once the last element is covered", () => {
        let state = stateWithCaretIn(1);
        state = state.apply(
            state.tr.setSelection(extendBlockSelection(state, 1)!),
        );
        state = state.apply(
            state.tr.setSelection(extendBlockSelection(state, 1)!),
        );
        // Now covers the paragraph and the trailing equation (the last element).
        expect(extendBlockSelection(state, 1)).toBeNull();
    });
});

describe("selectBlockRange (mouse selection)", () => {
    it("maps a position to its element index", () => {
        const doc = sectionToDoc(bodySchema, section);
        expect(blockIndexAtPos(doc, 1)).toBe(0); // inside the heading
        let pos = 0;
        for (let i = 0; i < 2; i += 1) {
            pos += doc.child(i).nodeSize;
        }
        expect(blockIndexAtPos(doc, pos)).toBe(2); // the equation atom
    });

    it("selects whole elements between two indices (order-independent)", () => {
        const state = stateWithCaretIn(0);
        let pos = 0;
        for (let i = 0; i < 2; i += 1) {
            pos += state.doc.child(i).nodeSize;
        }
        const applied = state.apply(
            state.tr.setSelection(selectBlockRange(state, 2, 0)),
        );
        // Range covers the heading through the equation; the atom is highlighted.
        expect(isBlockSelectionHighlighted(applied.selection, pos, 1)).toBe(true);
    });
});

describe("clearElementSelection (Esc deselects)", () => {
    it("collapses an element NodeSelection to a caret", () => {
        const selected = run(stateWithCaretIn(1), selectCurrentElement);
        expect(selected.selection).toBeInstanceOf(NodeSelection);
        const caret = clearElementSelection(selected);
        expect(caret).not.toBeNull();
        expect(caret!.empty).toBe(true);
    });

    it("collapses a multi-element range to a caret", () => {
        let state = stateWithCaretIn(0);
        state = state.apply(
            state.tr.setSelection(extendBlockSelection(state, 1)!),
        );
        state = state.apply(
            state.tr.setSelection(extendBlockSelection(state, 1)!),
        );
        expect(state.selection.empty).toBe(false);
        const caret = clearElementSelection(state);
        expect(caret).not.toBeNull();
        expect(caret!.empty).toBe(true);
    });

    it("returns null for a plain caret (nothing to clear)", () => {
        expect(clearElementSelection(stateWithCaretIn(1))).toBeNull();
    });
});

describe("isBlockSelectionHighlighted", () => {
    it("highlights every block under an AllSelection", () => {
        const state = stateWithCaretIn(1);
        const all = state.apply(
            state.tr.setSelection(new AllSelection(state.doc)),
        );
        let atomPos = 0;
        for (let i = 0; i < 2; i += 1) {
            atomPos += all.doc.child(i).nodeSize;
        }
        expect(
            isBlockSelectionHighlighted(all.selection, atomPos, 1),
        ).toBe(true);
    });

    it("does not highlight a block under a collapsed caret", () => {
        const state = stateWithCaretIn(1);
        expect(isBlockSelectionHighlighted(state.selection, 0, 1)).toBe(false);
    });
});
