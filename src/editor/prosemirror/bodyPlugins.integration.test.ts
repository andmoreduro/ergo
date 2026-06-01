import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createDiagram } from "../../state/ast/defaults";
import { isBlockEditing } from "./blockEditMode";
import { bodyPlugins } from "./plugins";
import { bodySchema } from "./schema";

/**
 * Uses the same plugin list as `ProseMirrorBodyEditor` (not a hand-picked subset).
 * If this passes but the desktop app does not, the bug is outside this stack
 * (stale HMR, Tauri focus, or selection not being a whole-block NodeSelection).
 */
describe("bodyPlugins integration", () => {
    it("Tab enters fine-grained mode on a locked diagram with production plugins", () => {
        const diagram = createDiagram("diag1");
        const block = bodySchema.nodes.diagram.create({
            elementId: diagram.id,
            element: diagram,
        });
        const doc = bodySchema.nodes.doc.create(null, [block]);

        let state = EditorState.create({
            doc,
            plugins: bodyPlugins(),
            selection: NodeSelection.create(doc, 0),
        });

        const mount = document.createElement("div");
        document.body.appendChild(mount);
        const view = new EditorView(mount, {
            state,
            dispatchTransaction(tr) {
                state = state.apply(tr);
                view.updateState(state);
            },
        });

        const event = new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
        });
        const handled = view.someProp("handleKeyDown", (fn) => fn(view, event));
        expect(handled).toBe(true);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);

        view.destroy();
        mount.remove();
    });
});
