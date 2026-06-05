import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { createDiagram } from "../../state/ast/defaults";
import { docToElements } from "./astBridge";
import { blockEditModePlugin, blockEditIds, isBlockEditing } from "./blockEditMode";
import { bodyKeyboardPlugin } from "./bodyKeyboardPlugin";
import { paragraphHasUnderline } from "./sectionReconcileGuard";
import { bodyPlugins } from "./plugins";
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

describe("bodyKeyboardPlugin Shift+Arrow", () => {
    it("defers to native selection for a partial in-block range", () => {
        const doc = diagramBlockDoc();
        let paragraphPos = -1;
        doc.forEach((node, offset) => {
            if (node.type.name === "paragraph") {
                paragraphPos = offset;
            }
        });

        const plugins = [bodyKeyboardPlugin()];
        const from = paragraphPos + 1;
        let state = EditorState.create({
            doc,
            plugins,
            selection: TextSelection.create(doc, from, from + 2),
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
            key: "ArrowDown",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        const handled = handler(view, event);
        expect(handled).toBe(false);
        expect(event.defaultPrevented).toBe(false);

        view.destroy();
        mount.remove();
    });

    it("defers to native selection when the range partially crosses blocks", () => {
        const paragraph1 = bodySchema.nodes.paragraph.create(
            { elementId: "p1", extraFields: {} },
            [bodySchema.text("hello world")],
        );
        const paragraph2 = bodySchema.nodes.paragraph.create(
            { elementId: "p2", extraFields: {} },
            [bodySchema.text("next block")],
        );
        const doc = bodySchema.nodes.doc.create(null, [paragraph1, paragraph2]);

        const plugins = [bodyKeyboardPlugin()];
        const firstInnerStart = 1;
        const secondInnerStart = 1 + paragraph1.nodeSize + 1;
        let state = EditorState.create({
            doc,
            plugins,
            selection: TextSelection.create(
                doc,
                firstInnerStart + 2,
                secondInnerStart + 2,
            ),
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
            key: "ArrowDown",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        const handled = handler(view, event);
        expect(handled).toBe(false);
        expect(event.defaultPrevented).toBe(false);

        view.destroy();
        mount.remove();
    });

    it("extends by one whole element after the current block is fully selected", () => {
        const doc = diagramBlockDoc();
        let paragraphPos = -1;
        let diagramPos = -1;
        doc.forEach((node, offset) => {
            if (node.type.name === "paragraph") {
                paragraphPos = offset;
            }
            if (node.type.name === "diagram") {
                diagramPos = offset;
            }
        });

        const plugins = [bodyKeyboardPlugin()];
        const paragraphInnerStart = paragraphPos + 1;
        const paragraphInnerEnd =
            paragraphPos + doc.child(0).nodeSize - 1;
        let state = EditorState.create({
            doc,
            plugins,
            selection: TextSelection.create(
                doc,
                paragraphInnerStart,
                paragraphInnerEnd,
            ),
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
            key: "ArrowDown",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        const handled = handler(view, event);
        expect(handled).toBe(true);
        expect(view.state.selection.from).toBeLessThanOrEqual(paragraphPos + 1);
        expect(view.state.selection.to).toBeGreaterThanOrEqual(
            diagramPos + doc.child(1).nodeSize,
        );

        view.destroy();
        mount.remove();
    });

    it("defers to native selection when shrinking a whole-block range", () => {
        const doc = diagramBlockDoc();
        let paragraphPos = -1;
        doc.forEach((node, offset) => {
            if (node.type.name === "paragraph") {
                paragraphPos = offset;
            }
        });

        const plugins = [bodyKeyboardPlugin()];
        const paragraphInnerStart = paragraphPos + 1;
        const paragraphInnerEnd =
            paragraphPos + doc.child(0).nodeSize - 1;
        let state = EditorState.create({
            doc,
            plugins,
            selection: TextSelection.create(
                doc,
                paragraphInnerStart,
                paragraphInnerEnd,
            ),
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
            key: "ArrowUp",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
        });
        const handled = handler(view, event);
        expect(handled).toBe(false);
        expect(event.defaultPrevented).toBe(false);
        expect(view.state.selection.from).toBe(paragraphInnerStart);
        expect(view.state.selection.to).toBe(paragraphInnerEnd);

        view.destroy();
        mount.remove();
    });
});

describe("underline keyboard routing", () => {
    it("does not toggle underline on Mod-u inside ProseMirror", () => {
        const doc = bodySchema.nodes.doc.create(null, [
            bodySchema.nodes.paragraph.create(
                { elementId: "p1", extraFields: {} },
                [bodySchema.text("hello")],
            ),
        ]);
        const mount = document.createElement("div");
        document.body.appendChild(mount);
        const view = new EditorView(mount, {
            state: EditorState.create({ doc, plugins: bodyPlugins() }),
        });
        try {
            const from = 1;
            const to = 1 + "hello".length;
            view.dispatch(
                view.state.tr.setSelection(
                    TextSelection.create(view.state.doc, from, to),
                ),
            );
            view.focus();
            const event = new KeyboardEvent("keydown", {
                key: "u",
                code: "KeyU",
                ctrlKey: true,
                bubbles: true,
                cancelable: true,
            });
            view.dom.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(false);
            expect(paragraphHasUnderline(docToElements(view.state.doc))).toBe(
                false,
            );
        } finally {
            view.destroy();
            mount.remove();
        }
    });
});
