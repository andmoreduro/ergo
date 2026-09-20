import { describe, expect, it } from "vitest";
import { createInitialSessionState, createSessionReducer } from "./DocumentContext";
import { createDocumentAST } from "./ast/defaults";

const reducer = createSessionReducer(100);

const commitTitle = (
    state: ReturnType<typeof createInitialSessionState>,
    title: string,
) =>
    reducer(state, {
        type: "COMMIT_EVENTS",
        forward: [{ type: "setProjectTitle", title }],
        inverse: [{ type: "setProjectTitle", title: state.ast.metadata.title }],
    });

describe("session reducer MARK_SAVED", () => {
    it("keeps the document dirty when edits landed after the persisted AST", () => {
        const initial = createInitialSessionState(createDocumentAST("none"));
        const afterFirst = commitTitle(initial, "first");
        const persisted = afterFirst.ast;
        // A keystroke commits while the archive write is still in flight.
        const afterSecond = commitTitle(afterFirst, "second");

        const marked = reducer(afterSecond, { type: "MARK_SAVED", savedAst: persisted });
        expect(marked.isDirty).toBe(true);
        expect(marked.ast.metadata.title).toBe("second");
    });

    it("clears the dirty flag when the persisted AST is the current one", () => {
        const initial = createInitialSessionState(createDocumentAST("none"));
        const edited = commitTitle(initial, "first");

        expect(edited.isDirty).toBe(true);
        expect(reducer(edited, { type: "MARK_SAVED", savedAst: edited.ast }).isDirty).toBe(false);
        expect(reducer(edited, { type: "MARK_SAVED", savedAst: null }).isDirty).toBe(false);
    });
});
