import { describe, expect, it } from "vitest";
import type { KeymapSettings } from "../bindings/KeymapSettings";
import { createKeymapProfile } from "./keymap";

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

    it("keeps non-empty action IDs for Rust catalog validation", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Custom",
            keymap_bindings: [],
            keymap_overrides: [
                ({
                    action_id: "unknown.action",
                    context: "app",
                    sequence: [{ key: "o", modifiers: ["Control", "Alt"] }],
                } as never),
            ],
        };

        const { keymap } = createKeymapProfile(settings);

        expect(keymap.bindings).toContainEqual(
            expect.objectContaining({
                commandId: "unknown.action",
                context: "app",
                keys: "Ctrl+Alt+O",
            }),
        );
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

        expect(keymap.bindings).toEqual([
            expect.objectContaining({
                commandId: "workspace::OpenProject",
                context: "app",
                keys: "",
                scope: "global",
                sequence: [],
            }),
        ]);
        expect(conflicts).toEqual([]);
    });

    it("ignores old keymap fields from unreleased formats", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Migrated",
            keymap_bindings: [],
            keymap_overrides: [
                ({
                    command_id: "project.open",
                    keys: "Ctrl+Alt+O",
                    scope: "global",
                } as never),
            ],
        };

        const { keymap } = createKeymapProfile(settings);

        expect(
            keymap.bindings.some((binding) => binding.keys === "Ctrl+Alt+O"),
        ).toBe(false);
    });
});
