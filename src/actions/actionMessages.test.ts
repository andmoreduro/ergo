import { describe, expect, it } from "vitest";
import { formatActionCatalogLabel } from "./actionMessages";

describe("formatActionCatalogLabel", () => {
    it("formats namespace and localized description", () => {
        expect(
            formatActionCatalogLabel(
                "workspace::OpenProject",
                "action_workspace_open_project_description",
            ),
        ).toBe("workspace: Open an existing .ergproj archive.");
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
