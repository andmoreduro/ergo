import { describe, expect, it } from "vitest";
import { isSettingsChromeTarget } from "./blockWholeSelection";

describe("isSettingsChromeTarget", () => {
    it("matches the settings chrome wrapper and its button", () => {
        const root = document.createElement("div");
        root.dataset.elementSettingsChrome = "";
        const button = document.createElement("button");
        root.appendChild(button);
        document.body.appendChild(root);

        expect(isSettingsChromeTarget(button)).toBe(true);
        expect(isSettingsChromeTarget(root)).toBe(true);

        root.remove();
    });

    it("ignores other controls", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        expect(isSettingsChromeTarget(input)).toBe(false);
        input.remove();
    });
});
