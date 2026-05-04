import { describe, expect, it } from "vitest";
import { detectKeymapConflicts } from "./keymap";
import type { KeyBinding } from "./types";

describe("keymap", () => {
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
