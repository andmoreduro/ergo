import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { COMPILE_QUEUED_EVENT } from "./compileEvents";

describe("TauriApi type boundaries", () => {
    it("uses generated bindings instead of handwritten IPC type shadows", () => {
        const source = readFileSync(resolve("src/api/tauri.ts"), "utf8");

        expect(source).toContain("../bindings/CompilationResult");
        expect(source).toContain("../bindings/DocumentSessionStatus");
        expect(source).not.toContain("../types/");
    });

    it("keeps compile lifecycle event names outside the IPC wrapper", () => {
        expect(COMPILE_QUEUED_EVENT).toBe("ergo-compile-queued");
    });
});
