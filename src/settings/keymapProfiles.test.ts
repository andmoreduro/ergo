import { describe, expect, it } from "vitest";
import {
    CUSTOM_KEYMAP_PROFILE_ID,
    DEFAULT_KEYMAP_PROFILE_ID,
    ensureCustomProfileForEdit,
    normalizeKeymapSettings,
} from "./keymapProfiles";

describe("normalizeKeymapSettings", () => {
    it("migrates legacy overrides into a custom profile", () => {
        const normalized = normalizeKeymapSettings({
            keymap_profile: "Custom",
            keymap_bindings: [],
            keymap_overrides: [
                {
                    action_id: "workspace::SaveProject",
                    context: "workspace && !input",
                    sequence: [{ key: "s", modifiers: ["Control"] }],
                },
            ],
            active_profile_id: DEFAULT_KEYMAP_PROFILE_ID,
            profiles: [],
        });

        expect(normalized.active_profile_id).toBe(CUSTOM_KEYMAP_PROFILE_ID);
        expect(normalized.profiles).toHaveLength(2);
        expect(normalized.keymap_overrides).toHaveLength(1);
    });

    it("forks to custom profile on first edit", () => {
        const normalized = ensureCustomProfileForEdit(
            normalizeKeymapSettings({
                keymap_profile: "Default",
                keymap_bindings: [],
                keymap_overrides: [],
                active_profile_id: DEFAULT_KEYMAP_PROFILE_ID,
                profiles: [],
            }),
        );

        expect(normalized.active_profile_id).toBe(CUSTOM_KEYMAP_PROFILE_ID);
        expect(
            normalized.profiles.some(
                (profile) => profile.id === CUSTOM_KEYMAP_PROFILE_ID,
            ),
        ).toBe(true);
    });
});
