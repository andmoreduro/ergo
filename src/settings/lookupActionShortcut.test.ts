import { describe, expect, it } from "vitest";
import type { KeymapProfile } from "../commands/types";
import { lookupActionShortcut } from "./keymap";

const fixtureKeymap: KeymapProfile = {
    bindings: [
        {
            commandId: "view::OpenCommandPalette",
            context: "app",
            keys: "Ctrl+Shift+P",
        },
        {
            commandId: "edit::Undo",
            context: "body",
            keys: "Ctrl+Z",
        },
    ],
};

describe("lookupActionShortcut", () => {
    it("returns the bound shortcut for a catalog action", () => {
        expect(
            lookupActionShortcut(fixtureKeymap, "view::OpenCommandPalette", "app"),
        ).toBe("Ctrl+Shift+P");
    });

    it("prefers the requested context when multiple bindings exist", () => {
        expect(
            lookupActionShortcut(fixtureKeymap, "edit::Undo", "body"),
        ).toBe("Ctrl+Z");
    });

    it("returns null when the action has no binding", () => {
        expect(
            lookupActionShortcut(fixtureKeymap, "help::OpenAbout"),
        ).toBeNull();
    });
});
