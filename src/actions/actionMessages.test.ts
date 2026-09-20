import { describe, expect, it, vi } from "vitest";
import { formatActionCatalogLabel } from "./actionMessages";

vi.mock("../paraglide/messages.js", () => ({
    m: {
        action_test_description: () => "Sentinel description",
    },
}));

describe("formatActionCatalogLabel", () => {
    it("joins the action namespace with the localized description", () => {
        expect(
            formatActionCatalogLabel("workspace::Test", "action_test_description"),
        ).toBe("workspace: Sentinel description");
    });

    it("falls back to humanized command name when description is missing", () => {
        expect(
            formatActionCatalogLabel(
                "editor::MergeTableCells",
                "action_missing_description",
            ),
        ).toBe("editor: Merge Table Cells");
    });
});
