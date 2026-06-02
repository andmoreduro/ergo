import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    ACTIVE_TABLE_CELL_ACTION_CONTEXT_ID,
    buildActionContextSnapshot,
} from "./buildActionContextSnapshot";

vi.mock("./prosemirror/activeView", () => ({
    getActiveBodyView: vi.fn(),
    getActiveTableCellEditor: vi.fn(),
}));

vi.mock("./prosemirror/table/tableCellInsertPolicy", () => ({
    isActiveTableCellEditing: vi.fn(),
}));

import {
    getActiveBodyView,
    getActiveTableCellEditor,
} from "./prosemirror/activeView";
import { isActiveTableCellEditing } from "./prosemirror/table/tableCellInsertPolicy";

const baseSnapshot = () => ({
    window_id: "main",
    focused_context_id: "body-sec",
    nodes: [
        {
            id: "body-sec",
            parent_id: "editor",
            contexts: ["body", "editor"],
            attributes: {},
        },
    ],
});

describe("buildActionContextSnapshot", () => {
    beforeEach(() => {
        vi.mocked(getActiveBodyView).mockReturnValue(null);
        vi.mocked(getActiveTableCellEditor).mockReturnValue(null);
        vi.mocked(isActiveTableCellEditing).mockReturnValue(false);
    });

    it("omits input context for ProseMirror body targets", () => {
        const bodyDom = document.createElement("div");
        bodyDom.setAttribute("contenteditable", "true");
        const getSnapshot = vi.fn((opts?: { includeInputContext?: boolean }) => {
            if (opts?.includeInputContext) {
                return {
                    ...baseSnapshot(),
                    focused_context_id: "active-input",
                    nodes: [
                        ...baseSnapshot().nodes,
                        {
                            id: "active-input",
                            parent_id: "body-sec",
                            contexts: ["input"],
                            attributes: {},
                        },
                    ],
                };
            }
            return baseSnapshot();
        });
        vi.mocked(getActiveBodyView).mockReturnValue({ dom: bodyDom } as never);

        const snapshot = buildActionContextSnapshot(bodyDom, getSnapshot);

        expect(getSnapshot).toHaveBeenCalledWith({ includeInputContext: false });
        expect(snapshot.focused_context_id).toBe("body-sec");
        expect(snapshot.nodes.some((n) => n.contexts.includes("input"))).toBe(
            false,
        );
    });

    it("injects tableCell context when editing a nested cell editor", () => {
        const cellDom = document.createElement("div");
        cellDom.setAttribute("contenteditable", "true");
        vi.mocked(isActiveTableCellEditing).mockReturnValue(true);
        vi.mocked(getActiveTableCellEditor).mockReturnValue({ dom: cellDom } as never);

        const snapshot = buildActionContextSnapshot(
            cellDom,
            vi.fn(() => baseSnapshot()),
        );

        expect(snapshot.focused_context_id).toBe(
            ACTIVE_TABLE_CELL_ACTION_CONTEXT_ID,
        );
        const cellNode = snapshot.nodes.find(
            (n) => n.id === ACTIVE_TABLE_CELL_ACTION_CONTEXT_ID,
        );
        expect(cellNode?.contexts).toEqual(["tableCell"]);
    });
});
