import { describe, expect, it } from "vitest";
import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import { buildKeymapSettingRows } from "./keymapCatalog";

describe("buildKeymapSettingRows", () => {
    it("includes bindable catalog actions without default bindings", () => {
        const catalog: ActionDescriptor[] = [
            {
                id: "workspace::ExportSvg",
                label_key: "action_workspace_export_svg",
                description_key: "action_workspace_export_svg_description",
                category: "workspace",
                default_context: "workspace && !input",
                allows_keybinding: true,
                requires_project: true,
            },
        ];

        const rows = buildKeymapSettingRows(catalog, {
            name: "Default",
            bindings: [],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]?.actionId).toBe("workspace::ExportSvg");
        expect(rows[0]?.keys).toBe("");
    });
});
