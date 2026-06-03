import { describe, expect, it, afterEach, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { bodySchema } from "./prosemirror/schema";
import { bodyPlugins } from "./prosemirror/plugins";
import { createParagraph } from "../state/ast/defaults";
import { sectionToDoc } from "./prosemirror/astBridge";
import { resolveBodyInsertAnchor } from "./bodyInsertAnchor";

vi.mock("./prosemirror/table/tableCellInsertPolicy", () => ({
    isActiveTableCellEditing: vi.fn(() => false),
}));

describe("resolveBodyInsertAnchor", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("returns the selected block from ProseMirror state without DOM focus", () => {
        const paragraph = createParagraph("", "p1");
        const section = {
            type: "Content" as const,
            id: "sec1",
            elements: [paragraph],
        };
        const doc = sectionToDoc(bodySchema, section);
        const mount = document.createElement("div");
        mount.setAttribute("data-ergo-body-editor", "");
        document.body.appendChild(mount);

        const view = new EditorView(mount, {
            state: EditorState.create({
                doc,
                plugins: bodyPlugins(),
            }),
        });
        view.focus();

        const toolbar = document.createElement("button");
        document.body.appendChild(toolbar);
        toolbar.focus();

        const anchor = resolveBodyInsertAnchor(view);
        expect(anchor).toEqual({ afterElementId: "p1" });

        view.destroy();
        mount.remove();
        toolbar.remove();
    });
});
