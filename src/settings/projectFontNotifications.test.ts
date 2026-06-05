import { describe, expect, it } from "vitest";

import type { ProjectFontAvailability } from "../bindings/ProjectFontAvailability";
import { projectFontsUnavailableToastMessage } from "./projectFontNotifications";

describe("projectFontsUnavailableToastMessage", () => {
    it("returns null when every configured font is available", () => {
        const availability = {
            textFont: { requested: "Libertinus Serif", available: true, fallback: "Libertinus Serif" },
            mathFont: { requested: null, available: false, fallback: "New Computer Modern Math" },
            rawFont: { requested: null, available: false, fallback: "DejaVu Sans Mono" },
        } satisfies ProjectFontAvailability;

        expect(projectFontsUnavailableToastMessage(availability)).toBeNull();
    });

    it("lists missing fonts and bundled fallbacks", () => {
        const availability = {
            textFont: {
                requested: "Missing Font",
                available: false,
                fallback: "Libertinus Serif",
            },
            mathFont: {
                requested: "Another Missing Font",
                available: false,
                fallback: "New Computer Modern Math",
            },
            rawFont: { requested: null, available: false, fallback: "DejaVu Sans Mono" },
        } satisfies ProjectFontAvailability;

        const message = projectFontsUnavailableToastMessage(availability);
        expect(message).toContain("Missing Font");
        expect(message).toContain("Another Missing Font");
        expect(message).toContain("Libertinus Serif");
    });
});
