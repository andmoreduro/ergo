import { afterEach, describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createDiagram } from "../../state/ast/defaults";
import { blockEditModePlugin, isBlockEditing, setBlockEditing } from "./blockEditMode";
import { blockFocusInvariantPlugin } from "./blockFocusInvariant";
import { blockSelectionGuardPlugin } from "./blockSelectionGuard";
import { enterAtomBlock, enterBlockEditById } from "./bodyTableCommands";
import { bodySchema } from "./schema";

const build = (withField: boolean) => {
    const diagram = createDiagram("diag1");
    const block = bodySchema.nodes.diagram.create({
        elementId: diagram.id,
        element: diagram,
    });
    const paragraph = bodySchema.nodes.paragraph.create(
        { elementId: "p1", extraFields: {} },
        [bodySchema.text("text")],
    );
    const doc = bodySchema.nodes.doc.create(null, [paragraph, block]);
    const blockPos = paragraph.nodeSize;

    const mount = document.createElement("div");
    document.body.appendChild(mount);
    let state = EditorState.create({
        doc,
        plugins: [
            blockEditModePlugin(),
            blockSelectionGuardPlugin(),
            blockFocusInvariantPlugin(),
        ],
        selection: NodeSelection.create(doc, blockPos),
    });
    const view = new EditorView(mount, {
        state,
        nodeViews: {
            diagram: () => {
                const dom = document.createElement("div");
                dom.setAttribute("data-pm-nodeview", "diagram");
                if (withField) {
                    dom.innerHTML =
                        '<div data-wrapper-tab="extra" data-wrapper-tab-index="0"><textarea id="field"></textarea></div>';
                }
                return { dom, stopEvent: () => true, ignoreMutation: () => true };
            },
        },
        dispatchTransaction(tr) {
            state = state.apply(tr);
            view.updateState(state);
        },
    });
    return { view, mount, blockPos, field: mount.querySelector<HTMLTextAreaElement>("#field") };
};

describe("block focus invariant", () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
        cleanups.splice(0).forEach((fn) => fn());
    });

    it("ends edit mode when focus moves out of the block, keeping the block selected", () => {
        const { view, mount, field } = build(true);
        cleanups.push(() => { view.destroy(); mount.remove(); });

        expect(enterAtomBlock(view)).toBe(true);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);
        expect(document.activeElement).toBe(field);

        // Focus back on the ProseMirror root (what a preview click or a
        // programmatic node selection does): edit mode must end.
        view.focus();
        expect(isBlockEditing(view.state, "diag1")).toBe(false);
        expect(view.state.selection instanceof NodeSelection).toBe(true);
    });

    it("keeps edit mode while focus stays inside the block or in a dialog", () => {
        const { view, mount, field } = build(true);
        cleanups.push(() => { view.destroy(); mount.remove(); });
        enterAtomBlock(view);

        const dialog = document.createElement("div");
        dialog.setAttribute("role", "dialog");
        dialog.innerHTML = "<input id='dlg' />";
        document.body.appendChild(dialog);
        cleanups.push(() => dialog.remove());

        dialog.querySelector<HTMLInputElement>("#dlg")!.focus();
        expect(isBlockEditing(view.state, "diag1")).toBe(true);

        field!.focus();
        expect(isBlockEditing(view.state, "diag1")).toBe(true);
    });

    it("refuses to enter edit mode when nothing inside the block can take focus", () => {
        const { view, mount } = build(false);
        cleanups.push(() => { view.destroy(); mount.remove(); });
        view.focus();

        expect(enterAtomBlock(view)).toBe(false);
        expect(isBlockEditing(view.state, "diag1")).toBe(false);
        expect(view.state.selection instanceof NodeSelection).toBe(true);
    });

    it("lets entry set the mode before the field takes focus, with the root focused", () => {
        const { view, mount, field } = build(true);
        cleanups.push(() => { view.destroy(); mount.remove(); });
        view.focus();

        // The real entry sequence: edit mode is dispatched while the root still
        // has focus, then the block's field is focused.
        expect(enterAtomBlock(view)).toBe(true);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);
        expect(document.activeElement).toBe(field);
        expect(view.hasFocus()).toBe(false);
    });
    it("opening a block by id focuses its field first and then marks it editing", () => {
        const { view, mount, field } = build(true);
        cleanups.push(() => { view.destroy(); mount.remove(); });
        view.focus();

        expect(enterBlockEditById(view, "diag1")).toBe(true);
        expect(document.activeElement).toBe(field);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);
        expect(view.hasFocus()).toBe(false);
        expect(view.state.selection instanceof NodeSelection).toBe(true);
    });
});
