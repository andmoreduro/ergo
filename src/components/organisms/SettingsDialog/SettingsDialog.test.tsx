import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KeymapSettings } from "../../../bindings/KeymapSettings";
import { createKeymapProfile } from "../../../settings/keymap";
import {
    DEFAULT_GLOBAL_SETTINGS,
    DEFAULT_PROJECT_SETTINGS,
} from "../../../settings/defaults";
import { SettingsDialog } from "./SettingsDialog";

import "@testing-library/jest-dom";

const renderGlobalDialog = (
    onGlobalSettingsChange = vi.fn(),
    globalSettings = DEFAULT_GLOBAL_SETTINGS,
) => {
    const keymapSettings: KeymapSettings = {
        keymap_profile: "Default",
        keymap_bindings: [],
        keymap_overrides: [],
    };
    const { keymap, conflicts } = createKeymapProfile(keymapSettings);

    render(
        <SettingsDialog
            conflicts={conflicts}
            globalSettings={globalSettings}
            keymap={keymap}
            keymapSettings={keymapSettings}
            panel="global"
            projectSettings={DEFAULT_PROJECT_SETTINGS}
            onClose={vi.fn()}
            onGlobalSettingsChange={onGlobalSettingsChange}
            onKeymapSettingsChange={vi.fn()}
            onProjectSettingsChange={vi.fn()}
        />,
    );

    return onGlobalSettingsChange;
};

const renderKeymapDialog = (
    keymapSettings: KeymapSettings,
    onKeymapSettingsChange = vi.fn(),
) => {
    const { keymap, conflicts } = createKeymapProfile(keymapSettings);

    render(
        <SettingsDialog
            conflicts={conflicts}
            globalSettings={DEFAULT_GLOBAL_SETTINGS}
            keymap={keymap}
            keymapSettings={keymapSettings}
            panel="keymap"
            projectSettings={DEFAULT_PROJECT_SETTINGS}
            onClose={vi.fn()}
            onGlobalSettingsChange={vi.fn()}
            onKeymapSettingsChange={onKeymapSettingsChange}
            onProjectSettingsChange={vi.fn()}
        />,
    );

    return onKeymapSettingsChange;
};

describe("SettingsDialog global panel", () => {
    it("keeps preview debounce disabled by default and enables the debounce time field from the UI", () => {
        const handleGlobalSettingsChange = renderGlobalDialog();

        expect(
            screen.getByLabelText("Debounce preview compilation"),
        ).not.toBeChecked();
        expect(screen.getByLabelText("Preview debounce time (ms)")).toBeDisabled();

        fireEvent.click(screen.getByLabelText("Debounce preview compilation"));

        expect(handleGlobalSettingsChange).toHaveBeenCalledWith(
            expect.objectContaining({
                preview_debounce_enabled: true,
                preview_debounce_ms: 120,
            }),
        );
    });
});

describe("SettingsDialog keymap panel", () => {
    it("edits keymap shortcuts through user overrides", () => {
        const keymapSettings: KeymapSettings = {
            keymap_profile: "Default",
            keymap_bindings: [
                {
                    action_id: "workspace::OpenProject",
                    keys: "Ctrl+O",
                    scope: "global",
                },
            ],
            keymap_overrides: [],
        };
        const handleKeymapSettingsChange = renderKeymapDialog(keymapSettings);

        const shortcutButton = screen.getByRole("button", {
            name: "Shortcut for workspace::OpenProject",
        });
        fireEvent.click(shortcutButton);
        fireEvent.keyDown(shortcutButton, {
            key: "o",
            ctrlKey: true,
            altKey: true,
        });
        fireEvent.keyDown(shortcutButton, { key: "Enter" });

        expect(handleKeymapSettingsChange).toHaveBeenCalledWith(
            expect.objectContaining({
                keymap_overrides: [
                    {
                        action_id: "workspace::OpenProject",
                        context: "app",
                        sequence: [
                            {
                                key: "o",
                                modifiers: ["Control", "Alt"],
                            },
                        ],
                    },
                ],
            }),
        );
    });

    it("resets keymap shortcut overrides from the UI", () => {
        const keymapSettings: KeymapSettings = {
            keymap_profile: "Default",
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
        const handleKeymapSettingsChange = renderKeymapDialog(keymapSettings);

        fireEvent.click(
            screen.getByRole("button", {
                name: "Reset shortcut for workspace::OpenProject",
            }),
        );

        expect(handleKeymapSettingsChange).toHaveBeenCalledWith(
            expect.objectContaining({
                keymap_overrides: [],
            }),
        );
    });

    it("clears keymap shortcuts by writing an empty override", () => {
        const keymapSettings: KeymapSettings = {
            keymap_profile: "Default",
            keymap_bindings: [
                {
                    action_id: "workspace::OpenProject",
                    keys: "Ctrl+O",
                    scope: "global",
                },
            ],
            keymap_overrides: [],
        };
        const handleKeymapSettingsChange = renderKeymapDialog(keymapSettings);

        fireEvent.click(
            screen.getByRole("button", {
                name: "Clear shortcut for workspace::OpenProject",
            }),
        );

        expect(handleKeymapSettingsChange).toHaveBeenCalledWith(
            expect.objectContaining({
                keymap_overrides: [
                    {
                        action_id: "workspace::OpenProject",
                        context: "app",
                        sequence: [],
                    },
                ],
            }),
        );
    });
});
