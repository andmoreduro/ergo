import { describe, expect, it } from "vitest";
import type { KeymapProfile } from "../../commands/types";
import { lookupActionShortcut } from "./profile";

const fixtureKeymap: KeymapProfile = {
    bindings: [
        {
            commandId: "view::OpenCommandPalette",
            context: "app",
            keys: "Ctrl+Shift+P",
        },
        // Same action bound in two contexts: the first binding is NOT the
        // body-context one, so a passing preferred-context assertion can only
        // succeed through the context-priority branch.
        {
            commandId: "edit::Undo",
            context: "app",
            keys: "Ctrl+Alt+T",
        },
        {
            commandId: "edit::Undo",
            context: "body",
            keys: "Ctrl+Z",
        },
        // Blank-key bindings are treated as unbound and must be skipped.
        {
            commandId: "editor::InsertParagraph",
            context: "app",
            keys: "   ",
        },
    ],
};

describe("lookupActionShortcut", () => {
    it("returns the bound shortcut for a catalog action", () => {
        expect(
            lookupActionShortcut(fixtureKeymap, "view::OpenCommandPalette", "app"),
        ).toBe("Ctrl+Shift+P");
    });

    it("prefers the requested context over binding order", () => {
        expect(lookupActionShortcut(fixtureKeymap, "edit::Undo", "body")).toBe(
            "Ctrl+Z",
        );
    });

    it("falls back to the first binding when the context has no match", () => {
        expect(lookupActionShortcut(fixtureKeymap, "edit::Undo", "table")).toBe(
            "Ctrl+Alt+T",
        );
        expect(lookupActionShortcut(fixtureKeymap, "edit::Undo")).toBe("Ctrl+Alt+T");
    });

    it("skips blank-key bindings and returns null when unbound", () => {
        expect(
            lookupActionShortcut(fixtureKeymap, "editor::InsertParagraph", "app"),
        ).toBeNull();
        expect(lookupActionShortcut(fixtureKeymap, "help::OpenAbout")).toBeNull();
    });
});
