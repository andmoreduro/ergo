import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP, detectKeymapConflicts } from "./keymap";
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

describe("DEFAULT_KEYMAP alignment with the Rust default keymap", () => {
    // The Rust default (src-tauri/defaults/default_keymap.json) is the shipped
    // keymap; DEFAULT_KEYMAP only covers the pre-IPC boot window. If this test
    // fails, the two copies drifted: update the JSON (product source of truth)
    // or mirror the same change here — never let the tables diverge silently.
    type JsonBinding = {
        action_id: string;
        context: string;
        sequence: Array<{ key: string; modifiers?: string[] }>;
    };

    const jsonBindings: JsonBinding[] = JSON.parse(
        readFileSync(
            resolve(__dirname, "../../src-tauri/defaults/default_keymap.json"),
            "utf8",
        ),
    ).keymap_bindings;

    const signature = (
        actionId: string,
        context: string,
        sequence: Array<{ key: string; modifiers?: string[] }>,
    ) =>
        `${actionId} @ ${context} :: ${sequence
            .map((stroke) => {
                const modifiers = (stroke.modifiers ?? [])
                    .map((modifier) => (modifier === "Control" ? "Ctrl" : modifier))
                    .sort()
                    .join("+");
                const key =
                    stroke.key.length === 1
                        ? stroke.key.toLocaleUpperCase()
                        : stroke.key;
                return `${modifiers}${modifiers ? "+" : ""}${key}`;
            })
            .join(" ")}`;

    const frontendSignatures = DEFAULT_KEYMAP.bindings.map((binding) =>
        signature(binding.commandId, binding.context, binding.sequence),
    );

    const backendSignatures = jsonBindings.map((binding) =>
        signature(binding.action_id, binding.context, binding.sequence),
    );

    it("mirrors the Rust default keymap binding-for-binding", () => {
        expect([...frontendSignatures].sort()).toEqual([...backendSignatures].sort());
    });
});
