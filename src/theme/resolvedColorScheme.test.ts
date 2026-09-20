import { afterEach, describe, expect, it, vi } from "vitest";
import { readResolvedColorScheme } from "./resolvedColorScheme";

const stubMatchMedia = (matches: boolean): void => {
    vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({ matches, addEventListener: () => {} }),
    );
};

describe("resolvedColorScheme", () => {
    afterEach(() => {
        document.documentElement.removeAttribute("data-theme");
        vi.unstubAllGlobals();
    });

    it("reads explicit light and dark themes from data-theme", () => {
        stubMatchMedia(true);

        document.documentElement.dataset.theme = "light";
        expect(readResolvedColorScheme()).toBe("light");

        document.documentElement.dataset.theme = "dark";
        expect(readResolvedColorScheme()).toBe("dark");
    });

    it("falls back to the system preference without data-theme", () => {
        stubMatchMedia(true);
        expect(readResolvedColorScheme()).toBe("dark");

        stubMatchMedia(false);
        expect(readResolvedColorScheme()).toBe("light");
    });

    it("falls back to the system preference for an unrecognized data-theme value", () => {
        stubMatchMedia(true);
        document.documentElement.dataset.theme = "sepia";
        expect(readResolvedColorScheme()).toBe("dark");
    });
});
