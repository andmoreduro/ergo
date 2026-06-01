import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createDiagram } from "../../state/ast/defaults";
import { blockEditModePlugin, blockEditIds, isBlockEditing } from "./blockEditMode";
import { bodyKeyboardPlugin } from "./bodyKeyboardPlugin";
import { bodySchema } from "./schema";
import {
    clearActiveBodyView,
    setActiveBodyView,
    setBodyParagraphInsert,
} from "./activeView";

const diagramBlockDoc = () => {
    const diagram = createDiagram("diag1");
    const block = bodySchema.nodes.diagram.create({
        elementId: diagram.id,
        element: diagram,
    });
    const paragraph = bodySchema.nodes.paragraph.create(
        { elementId: "p1", extraFields: {} },
        [bodySchema.text("text")],
    );
    return bodySchema.nodes.doc.create(null, [paragraph, block]);
};

const handleKeyDownFromPlugin = () => {
    const plugin = bodyKeyboardPlugin();
    const handler = plugin.props?.handleKeyDown;
    if (!handler) {
        throw new Error("bodyKeyboardPlugin missing handleKeyDown");
    }
    return handler;
};

describe("bodyKeyboardPlugin locked block entry", () => {
    it("enters fine-grained mode on Tab when a diagram block is whole-selected", () => {
        const doc = diagramBlockDoc();
        let blockPos = -1;
        doc.forEach((node, offset) => {
            if (node.type.name === "diagram") {
                blockPos = offset;
            }
        });

        const plugins = [blockEditModePlugin(), bodyKeyboardPlugin()];
        let state = EditorState.create({
            doc,
            plugins,
            selection: NodeSelection.create(doc, blockPos),
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
        setActiveBodyView(view);

        const handler = handleKeyDownFromPlugin();
        const event = new KeyboardEvent("keydown", {
            key: "Tab",
            bubbles: true,
            cancelable: true,
        });
        const prevented = handler(view, event);
        expect(prevented).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);

        view.destroy();
        clearActiveBodyView(view);
        mount.remove();
    });

    it("enters fine-grained mode on Ctrl+Enter when a diagram block is whole-selected", () => {
        const doc = diagramBlockDoc();
        let blockPos = -1;
        doc.forEach((node, offset) => {
            if (node.type.name === "diagram") {
                blockPos = offset;
            }
        });

        const plugins = [blockEditModePlugin(), bodyKeyboardPlugin()];
        let state = EditorState.create({
            doc,
            plugins,
            selection: NodeSelection.create(doc, blockPos),
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

        const handler = handleKeyDownFromPlugin();
        const event = new KeyboardEvent("keydown", {
            key: "Enter",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        const prevented = handler(view, event);
        expect(prevented).toBe(true);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);

        view.destroy();
        mount.remove();
    });

    it("Enter inserts a paragraph after a locked whole-selected block", () => {
        const doc = diagramBlockDoc();
        let blockPos = -1;
        doc.forEach((node, offset) => {
            if (node.type.name === "diagram") {
                blockPos = offset;
            }
        });

        let state = EditorState.create({
            doc,
            plugins: [blockEditModePlugin(), bodyKeyboardPlugin()],
            selection: NodeSelection.create(doc, blockPos),
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

        let afterElementId: string | null = null;
        setBodyParagraphInsert({
            insertBeforeElement: () => {},
            insertAfterElement: (id) => {
                afterElementId = id;
            },
        });

        try {
            const handler = handleKeyDownFromPlugin();
            const event = new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
            });
            const prevented = handler(view, event);
            expect(prevented).toBe(true);
            expect(event.defaultPrevented).toBe(true);
            expect(afterElementId).toBe("diag1");
        } finally {
            setBodyParagraphInsert(null);
            view.destroy();
            mount.remove();
        }
    });
});
