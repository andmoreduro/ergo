import { afterEach, describe, expect, it } from "vitest";
import { ergoThemeLogoSrc, readResolvedColorScheme } from "./resolvedColorScheme";

describe("resolvedColorScheme", () => {
    afterEach(() => {
        document.documentElement.removeAttribute("data-theme");
    });

    it("maps explicit light and dark themes to logo assets", () => {
        document.documentElement.dataset.theme = "light";
        expect(readResolvedColorScheme()).toBe("light");
        expect(ergoThemeLogoSrc("light")).toBe("/ergo_logo_light_mode.svg");

        document.documentElement.dataset.theme = "dark";
        expect(readResolvedColorScheme()).toBe("dark");
        expect(ergoThemeLogoSrc("dark")).toBe("/ergo_logo_dark_mode.svg");
    });
});
