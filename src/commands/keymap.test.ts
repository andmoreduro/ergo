import { describe, expect, it, vi } from "vitest";
import {
    DEFAULT_KEYMAP,
    detectKeymapConflicts,
    findCommandForKeyboardEvent,
} from "./keymap";
import { createCommandRegistry } from "./registry";
import type { CommandContext, KeyBinding } from "./types";

const createKeyboardEvent = (
    key: string,
    options: KeyboardEventInit = {},
    target?: HTMLElement,
): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        ...options,
    });

    if (target) {
        Object.defineProperty(event, "target", { value: target });
    }

    return event;
};

const context: CommandContext = {
    hasActiveProject: true,
    focusedElementId: null,
};

describe("keymap", () => {
    it("resolves keyboard chords to enabled command ids", () => {
        const registry = createCommandRegistry([
            {
                id: "view::OpenCommandPalette",
                label: "Command Palette",
                scope: "global",
                run: vi.fn(),
            },
        ]);

        const commandId = findCommandForKeyboardEvent(
            createKeyboardEvent("P", { ctrlKey: true, shiftKey: true }),
            DEFAULT_KEYMAP.bindings,
            registry,
            context,
        );

        expect(commandId).toBe("view::OpenCommandPalette");
    });

    it("does not run editor scoped shortcuts from text inputs", () => {
        const input = document.createElement("input");
        const registry = createCommandRegistry([
            {
                id: "editor::InsertParagraph",
                label: "Paragraph",
                scope: "editor",
                run: vi.fn(),
            },
        ]);

        const commandId = findCommandForKeyboardEvent(
            createKeyboardEvent("P", { ctrlKey: true, altKey: true }, input),
            DEFAULT_KEYMAP.bindings,
            registry,
            context,
        );

        expect(commandId).toBeNull();
    });

    it("chooses the action with the most specific active context", () => {
        const registry = createCommandRegistry([
            {
                id: "workspace::OpenProject",
                label: "Open Project",
                scope: "global",
                run: vi.fn(),
            },
            {
                id: "workspace::SaveProject",
                label: "Save Project",
                scope: "project",
                run: vi.fn(),
            },
        ]);
        const bindings: KeyBinding[] = [
            { commandId: "workspace::OpenProject", keys: "Ctrl+K", scope: "global" },
            { commandId: "workspace::SaveProject", keys: "Ctrl+K", scope: "project" },
        ];

        const commandId = findCommandForKeyboardEvent(
            createKeyboardEvent("K", { ctrlKey: true }),
            bindings,
            registry,
            context,
        );

        expect(commandId).toBe("workspace::SaveProject");
    });

    it("detects keymap conflicts within the same scope", () => {
        const bindings: KeyBinding[] = [
            { commandId: "workspace::NewProject", keys: "Ctrl+N", scope: "global" },
            { commandId: "workspace::OpenProject", keys: "Ctrl+N", scope: "global" },
            { commandId: "workspace::SaveProject", keys: "Ctrl+N", scope: "project" },
        ];

        expect(detectKeymapConflicts(bindings)).toEqual([
            {
                keys: "Ctrl+N",
                scope: "global",
                commandIds: ["workspace::NewProject", "workspace::OpenProject"],
            },
        ]);
    });

    it("ignores unbound shortcuts when detecting conflicts", () => {
        const bindings: KeyBinding[] = [
            { commandId: "workspace::NewProject", keys: "", scope: "global" },
            { commandId: "workspace::OpenProject", keys: "", scope: "global" },
        ];

        expect(detectKeymapConflicts(bindings)).toEqual([]);
    });
});
