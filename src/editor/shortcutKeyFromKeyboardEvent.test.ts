import { describe, expect, it } from "vitest";
import {
    isAltGrStyleChord,
    keyFromKeyboardCode,
    resolveShortcutKey,
    shouldUsePhysicalShortcutKey,
    shortcutChordModifiers,
} from "./shortcutKeyFromKeyboardEvent";

describe("resolveShortcutKey", () => {
    it("uses physical key for Ctrl+Alt chords (AltGr layouts)", () => {
        expect(
            resolveShortcutKey({
                key: "@",
                code: "KeyQ",
                ctrlKey: true,
                altKey: true,
            } as KeyboardEvent),
        ).toBe("q");
    });

    it("uses physical digit for Ctrl+Alt+Shift+number", () => {
        expect(
            resolveShortcutKey({
                key: "!",
                code: "Digit1",
                ctrlKey: true,
                altKey: true,
                shiftKey: true,
            } as KeyboardEvent),
        ).toBe("1");
    });

    it("uses physical digit when shift chord key disagrees with code", () => {
        expect(
            shouldUsePhysicalShortcutKey({
                key: "¡",
                code: "Digit1",
                ctrlKey: true,
                altKey: false,
                shiftKey: true,
                getModifierState: (key) => key === "AltGraph",
            } as KeyboardEvent),
        ).toBe(true);
        expect(
            resolveShortcutKey({
                key: "¡",
                code: "Digit1",
                ctrlKey: true,
                altKey: false,
                shiftKey: true,
                getModifierState: (key) => key === "AltGraph",
            } as KeyboardEvent),
        ).toBe("1");
    });

    it("uses physical key when AltGraph is active without ctrlKey", () => {
        expect(
            resolveShortcutKey({
                key: "@",
                code: "KeyQ",
                ctrlKey: false,
                altKey: false,
                getModifierState: (key) => key === "AltGraph",
            } as KeyboardEvent),
        ).toBe("q");
    });

    it("keeps logical key without Ctrl+Alt", () => {
        expect(
            resolveShortcutKey({
                key: "A",
                code: "KeyA",
                ctrlKey: true,
                altKey: false,
            } as KeyboardEvent),
        ).toBe("a");
    });
});

describe("shortcutChordModifiers", () => {
    it("maps AltGraph to Control+Alt for the resolver", () => {
        expect(
            shortcutChordModifiers({
                ctrlKey: false,
                altKey: false,
                shiftKey: false,
                metaKey: false,
                getModifierState: (key) => key === "AltGraph",
            } as KeyboardEvent),
        ).toEqual(["Control", "Alt"]);
    });
});

describe("keyFromKeyboardCode", () => {
    it("maps letter and digit codes", () => {
        expect(keyFromKeyboardCode("KeyH")).toBe("h");
        expect(keyFromKeyboardCode("Digit6")).toBe("6");
    });
});

describe("isAltGrStyleChord", () => {
    it("detects Ctrl+Alt and AltGraph", () => {
        expect(isAltGrStyleChord({ ctrlKey: true, altKey: true })).toBe(true);
        expect(isAltGrStyleChord({ ctrlKey: true, altKey: false })).toBe(false);
        expect(
            isAltGrStyleChord({
                ctrlKey: false,
                altKey: false,
                getModifierState: (key) => key === "AltGraph",
            } as KeyboardEvent),
        ).toBe(true);
    });
});
