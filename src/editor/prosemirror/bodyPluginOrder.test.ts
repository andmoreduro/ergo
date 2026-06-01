import { describe, expect, it } from "vitest";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { EditorState, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createDiagram } from "../../state/ast/defaults";
import { blockEditModePlugin, isBlockEditing } from "./blockEditMode";
import { bodyKeyboardPlugin } from "./bodyKeyboardPlugin";
import { setBodyParagraphInsert } from "./activeView";
import { bodySchema } from "./schema";

/** Mirrors `bodyPlugins()` key order: bodyKeyboardPlugin before typingKeymap. */
const pluginsWrongOrder = () => [
    blockEditModePlugin(),
    keymap(
        Object.fromEntries(
            Object.entries(baseKeymap).filter(([key]) => !/^Arrow/.test(key)),
        ),
    ),
    bodyKeyboardPlugin(),
];

const pluginsCorrectOrder = () => [
    blockEditModePlugin(),
    bodyKeyboardPlugin(),
    keymap(
        Object.fromEntries(
            Object.entries(baseKeymap).filter(([key]) => !/^Arrow/.test(key)),
        ),
    ),
];

describe("bodyKeyboardPlugin vs typingKeymap order", () => {
    it("baseKeymap steals Enter from locked blocks when it runs first", () => {
        const diagram = createDiagram("diag1");
        const block = bodySchema.nodes.diagram.create({
            elementId: diagram.id,
            element: diagram,
        });
        const doc = bodySchema.nodes.doc.create(null, [block]);
        const blockPos = 0;

        let state = EditorState.create({
            doc,
            plugins: pluginsWrongOrder(),
            selection: NodeSelection.create(doc, blockPos),
        });
        const childCountBefore = state.doc.childCount;

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
            key: "Enter",
            bubbles: true,
            cancelable: true,
        });
        view.dispatchEvent(event);

        expect(state.doc.childCount).toBeGreaterThan(childCountBefore);
        expect(isBlockEditing(state, "diag1")).toBe(false);

        view.destroy();
        mount.remove();
    });

    it("bodyKeyboardPlugin handles Enter before baseKeymap when insert bridge is set", () => {
        const diagram = createDiagram("diag1");
        const block = bodySchema.nodes.diagram.create({
            elementId: diagram.id,
            element: diagram,
        });
        const doc = bodySchema.nodes.doc.create(null, [block]);

        let state = EditorState.create({
            doc,
            plugins: pluginsCorrectOrder(),
            selection: NodeSelection.create(doc, 0),
        });
        const childCountBefore = state.doc.childCount;

        const mount = document.createElement("div");
        document.body.appendChild(mount);
        const view = new EditorView(mount, {
            state,
            dispatchTransaction(tr) {
                state = state.apply(tr);
                view.updateState(state);
            },
        });

        let afterElementId: string | null = null;
        setBodyParagraphInsert({
            insertBeforeElement: () => {},
            insertAfterElement: (id) => {
                afterElementId = id;
            },
        });

        try {
            const event = new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
            });
            view.dispatchEvent(event);

            expect(afterElementId).toBe("diag1");
            expect(state.doc.childCount).toBe(childCountBefore);
            expect(event.defaultPrevented).toBe(true);
        } finally {
            setBodyParagraphInsert(null);
            view.destroy();
            mount.remove();
        }
    });
});
