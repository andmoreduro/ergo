import { afterEach, describe, expect, it } from "vitest";
import { readResolvedColorScheme } from "./resolvedColorScheme";

describe("resolvedColorScheme", () => {
    afterEach(() => {
        document.documentElement.removeAttribute("data-theme");
    });

    it("reads explicit light and dark themes from data-theme", () => {
        document.documentElement.dataset.theme = "light";
        expect(readResolvedColorScheme()).toBe("light");

        document.documentElement.dataset.theme = "dark";
        expect(readResolvedColorScheme()).toBe("dark");
    });
});
