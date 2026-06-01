import { describe, expect, it, vi, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ActionRuntimeProvider } from "./runtime";
import { bodyPlugins } from "../editor/prosemirror/plugins";
import { isBlockEditing } from "../editor/prosemirror/blockEditMode";
import { createDiagram } from "../state/ast/defaults";
import { bodySchema } from "../editor/prosemirror/schema";
import { EditorState, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
    setActiveBodyView,
    clearActiveBodyView,
} from "../editor/prosemirror/activeView";
import { runBodyTab } from "../editor/prosemirror/bodyTabCommand";

vi.mock("../api/tauri", () => ({
    TauriApi: {
        resolveKeyEvent: vi.fn().mockResolvedValue({
            status: "matched",
            invocation: { id: "editor::EnterTable", payload: null },
        }),
        resetKeySequence: vi.fn(),
    },
}));

describe("action runtime key order", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("defers key dispatch so ProseMirror can handle Ctrl+Enter before EnterTable runs", async () => {
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
        setActiveBodyView(view);

        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => {
            root.render(
                createElement(
                    "div",
                    { "data-action-context-id": "editor" },
                    createElement(ActionRuntimeProvider, null, createElement("div")),
                ),
            );
        });

        view.focus();
        const event = new KeyboardEvent("keydown", {
            key: "Enter",
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        view.dom.dispatchEvent(event);

        expect(isBlockEditing(view.state, "diag1")).toBe(true);
        expect(event.defaultPrevented).toBe(true);

        await new Promise((resolve) => queueMicrotask(resolve));

        const { TauriApi } = await import("../api/tauri");
        expect(TauriApi.resolveKeyEvent).not.toHaveBeenCalled();

        await act(async () => {
            root.unmount();
        });
        view.destroy();
        clearActiveBodyView(view);
        mount.remove();
        host.remove();
    });

    it("runs body Tab in capture before preventDefault traps the key for WebView", async () => {
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
        setActiveBodyView(view);
        view.focus();

        const handled = runBodyTab(view, { shiftKey: false });
        expect(handled).toBe(true);
        expect(isBlockEditing(view.state, "diag1")).toBe(true);

        view.destroy();
        clearActiveBodyView(view);
        mount.remove();
    });
});
