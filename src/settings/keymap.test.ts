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
                    keys: "Ctrl+Alt+O",
                    scope: "global",
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

    it("ignores invalid keymap overrides", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Custom",
            keymap_bindings: [],
            keymap_overrides: [
                {
                    action_id: "unknown.action",
                    keys: "Ctrl+Alt+O",
                    scope: "global",
                },
                {
                    action_id: "workspace::OpenProject",
                    keys: "Ctrl+Alt+O",
                    scope: "unknown",
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
                    keys: "Ctrl+O",
                    scope: "global",
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
                    keys: "Ctrl+O",
                    scope: "global",
                },
            ],
            keymap_overrides: [
                {
                    action_id: "workspace::OpenProject",
                    keys: "Ctrl+Alt+O",
                    scope: "global",
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
                    keys: "Ctrl+O",
                    scope: "global",
                },
            ],
            keymap_overrides: [
                {
                    action_id: "workspace::OpenProject",
                    keys: "",
                    scope: "global",
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

    it("maps legacy command ids to action ids for existing user keymaps", () => {
        const settings: KeymapSettings = {
            keymap_profile: "Migrated",
            keymap_bindings: [],
            keymap_overrides: [
                {
                    action_id: "project.open",
                    keys: "Ctrl+Alt+O",
                    scope: "global",
                },
            ],
        };

        const { keymap } = createKeymapProfile(settings);

        expect(keymap.bindings).toContainEqual(
            expect.objectContaining({
                commandId: "workspace::OpenProject",
                context: "app",
                keys: "Ctrl+Alt+O",
                scope: "global",
            }),
        );
    });
});
