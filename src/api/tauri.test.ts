import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { RESOURCES_UPDATED_EVENT } from "./compileEvents";

describe("TauriApi type boundaries", () => {
    it("uses generated bindings instead of handwritten IPC type shadows", () => {
        const source = readFileSync(resolve("src/api/tauri.ts"), "utf8");

        expect(source).toContain("../bindings/DocumentOutline");
        expect(source).toContain("../bindings/DocumentSessionStatus");
        expect(source).not.toContain("../types/");
        expect(source).not.toContain("start_preview_watch");
        expect(source).not.toContain("jump_from_preview_click");
    });

    it("keeps resource preview event names outside the IPC wrapper", () => {
        expect(RESOURCES_UPDATED_EVENT).toBe("ergo-resources-updated");
    });
});
