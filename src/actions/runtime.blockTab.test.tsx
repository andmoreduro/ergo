import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { EditorState, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { ActionRuntimeProvider } from "./runtime";
import { bodyPlugins } from "../editor/prosemirror/plugins";
import { isBlockEditing } from "../editor/prosemirror/blockEditMode";
import { createBlockObjectNodeViews } from "../editor/prosemirror/nodeViews/blockObjectNodeViews";
import { NodeViewPortalRegistry } from "../editor/prosemirror/nodeViews/nodeViewPortals";
import { createDiagram } from "../state/ast/defaults";
import { bodySchema } from "../editor/prosemirror/schema";
import {
    clearActiveBodyView,
    setActiveBodyView,
} from "../editor/prosemirror/activeView";

vi.mock("../api/tauri", () => ({
    TauriApi: {
        resolveKeyEvent: vi.fn().mockResolvedValue({ status: "noMatch" }),
        resetKeySequence: vi.fn(),
    },
}));

const keydown = (target: Element, init: KeyboardEventInit) => {
    const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        ...init,
    });
    target.dispatchEvent(event);
    return event;
};

describe("block field Tab cycle through the action runtime", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("Tab enters the diagram, cycles its fields, and Shift+Tab returns to the previous field", async () => {
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

        const column = document.createElement("div");
        column.setAttribute("data-action-context-id", "editor");
        document.body.appendChild(column);
        const mount = document.createElement("div");
        column.appendChild(mount);

        const registry = new NodeViewPortalRegistry();
        let state = EditorState.create({
            doc,
            plugins: bodyPlugins(),
            selection: NodeSelection.create(doc, blockPos),
        });
        const view = new EditorView(mount, {
            state,
            nodeViews: createBlockObjectNodeViews(registry),
            dispatchTransaction(tr) {
                state = state.apply(tr);
                view.updateState(state);
            },
        });
        setActiveBodyView(view);

        // Stand-in for the DiagramEditor portal content: primary slot without
        // focusables (image preview), then the source textarea and the caption.
        const hostDom = registry.getSnapshot()[0].dom;
        hostDom.innerHTML =
            '<div data-wrapper-tab="primary"><span>preview</span></div>' +
            '<div data-wrapper-tab="extra" data-wrapper-tab-index="0"><textarea id="src"></textarea></div>' +
            '<div data-wrapper-tab="extra" data-wrapper-tab-index="1"><input id="cap" /></div>';
        const source = hostDom.querySelector<HTMLTextAreaElement>("#src")!;
        const caption = hostDom.querySelector<HTMLInputElement>("#cap")!;

        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => {
            root.render(
                createElement(ActionRuntimeProvider, null, createElement("div")),
            );
        });

        view.focus();
        expect(view.hasFocus()).toBe(true);

        const tab1 = keydown(view.dom, { key: "Tab" });
        expect(tab1.defaultPrevented).toBe(true);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);
        expect(document.activeElement).toBe(source);

        const tab2 = keydown(source, { key: "Tab" });
        expect(tab2.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(caption);

        const shiftTab = keydown(caption, { key: "Tab", shiftKey: true });
        expect(shiftTab.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(source);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);
        expect(view.state.selection instanceof NodeSelection).toBe(true);

        await act(async () => {
            root.unmount();
        });
        view.destroy();
        clearActiveBodyView(view);
        column.remove();
        host.remove();
    });
});
