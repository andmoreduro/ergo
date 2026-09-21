import { describe, expect, it } from "vitest";
import type { KeymapSettings } from "../../bindings/KeymapSettings";
import { createKeymapProfile } from "./profile";

describe("createKeymapProfile", () => {
    it("builds keymaps from the separate keymap settings model", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Custom",
            keymap_bindings: [],
            keymap_overrides: [
                {
                    action_id: "workspace::OpenProject",
                    context: "app",
                    sequence: [{ key: "o", modifiers: ["Control", "Alt"] }],
                },
            ],
        };

        const { keymap } = createKeymapProfile(settings);

        expect(keymap.name).toBe("Custom");
        expect(keymap.bindings).toContainEqual(
            expect.objectContaining({
                commandId: "workspace::OpenProject",
                context: "app",
                keys: "Ctrl+Alt+O",
                scope: "global",
            }),
        );
    });

    it("ignores incomplete keymap overrides", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Custom",
            keymap_bindings: [],
            keymap_overrides: [
                {
                    action_id: "" as never,
                    context: "app",
                    sequence: [{ key: "o", modifiers: ["Control", "Alt"] }],
                },
                {
                    action_id: "workspace::OpenProject",
                    context: "",
                    sequence: [{ key: "o", modifiers: ["Control", "Alt"] }],
                },
            ],
        };

        const { keymap } = createKeymapProfile(settings);

        expect(
            keymap.bindings.some((binding) => binding.keys === "Ctrl+Alt+O"),
        ).toBe(false);
    });

    it("uses bundled keymap bindings when they are provided", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Bundled",
            keymap_bindings: [
                {
                    action_id: "workspace::OpenProject",
                    context: "app",
                    sequence: [{ key: "o", modifiers: ["Control"] }],
                },
            ],
            keymap_overrides: [],
        };

        const { keymap } = createKeymapProfile(settings);

        expect(keymap.bindings).toEqual([
            expect.objectContaining({
                commandId: "workspace::OpenProject",
                context: "app",
                keys: "Ctrl+O",
                scope: "global",
            }),
        ]);
    });

    it("uses overrides to replace matching default bindings", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Custom",
            keymap_bindings: [
                {
                    action_id: "workspace::OpenProject",
                    context: "app",
                    sequence: [{ key: "o", modifiers: ["Control"] }],
                },
            ],
            keymap_overrides: [
                {
                    action_id: "workspace::OpenProject",
                    context: "app",
                    sequence: [{ key: "o", modifiers: ["Control", "Alt"] }],
                },
            ],
        };

        const { keymap } = createKeymapProfile(settings);

        expect(keymap.bindings).toEqual([
            expect.objectContaining({
                commandId: "workspace::OpenProject",
                context: "app",
                keys: "Ctrl+Alt+O",
                scope: "global",
            }),
        ]);
    });

    it("keeps empty override shortcuts so defaults can be unbound", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Custom",
            keymap_bindings: [
                {
                    action_id: "workspace::OpenProject",
                    context: "app",
                    sequence: [{ key: "o", modifiers: ["Control"] }],
                },
            ],
            keymap_overrides: [
                {
                    action_id: "workspace::OpenProject",
                    context: "app",
                    sequence: [],
                },
            ],
        };

        const { keymap, conflicts } = createKeymapProfile(settings);

        // An empty override unbinds the identity: no effective binding is left
        // (the settings panel still lists the action from the catalog).
        expect(keymap.bindings).toEqual([]);
        expect(conflicts).toEqual([]);
    });

    it("keeps bundled alternatives and replaces all of them with one override", () => {
        const bundled: KeymapSettings["keymap_bindings"] = [
            {
                action_id: "view::ZoomIn",
                context: "workspace",
                sequence: [{ key: "=", modifiers: ["Control"] }],
            },
            {
                action_id: "view::ZoomIn",
                context: "workspace",
                sequence: [{ key: "+", modifiers: ["Control"] }],
            },
            {
                action_id: "editor::InsertHeading",
                context: "editor",
                sequence: [{ key: "1", modifiers: ["Control", "Alt", "Shift"] }],
                payload: { level: 1 },
            },
            {
                action_id: "editor::InsertHeading",
                context: "editor",
                sequence: [{ key: "2", modifiers: ["Control", "Alt", "Shift"] }],
                payload: { level: 2 },
            },
        ];

        const untouched = createKeymapProfile({
            keymap_profile: "Default",
            keymap_bindings: bundled,
            keymap_overrides: [],
        });
        expect(untouched.keymap.bindings).toHaveLength(4);
        expect(untouched.conflicts).toEqual([]);

        const overridden = createKeymapProfile({
            keymap_profile: "Custom",
            keymap_bindings: bundled,
            keymap_overrides: [
                {
                    action_id: "view::ZoomIn",
                    context: "workspace",
                    sequence: [{ key: "z", modifiers: ["Control", "Shift"] }],
                },
                {
                    action_id: "editor::InsertHeading",
                    context: "editor",
                    sequence: [],
                    payload: { level: 2 },
                },
            ],
        });
        const zoom = overridden.keymap.bindings.filter((b) => b.commandId === "view::ZoomIn");
        expect(zoom).toHaveLength(1);
        expect(zoom[0]?.keys).toBe("Ctrl+Shift+Z");
        const headings = overridden.keymap.bindings.filter(
            (b) => b.commandId === "editor::InsertHeading",
        );
        expect(headings).toHaveLength(1);
        expect(headings[0]?.payload).toEqual({ level: 1 });
    });
});
