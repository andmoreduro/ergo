import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { COMPILE_STARTED_EVENT, COMPILE_SUCCEEDED_EVENT, COMPILE_FAILED_EVENT } from "./compileEvents";

describe("TauriApi type boundaries", () => {
    it("uses generated bindings instead of handwritten IPC type shadows", () => {
        const source = readFileSync(resolve("src/api/tauri.ts"), "utf8");

        expect(source).toContain("../bindings/CompilationResult");
        expect(source).toContain("../bindings/DocumentOutline");
        expect(source).toContain("../bindings/DocumentSessionStatus");
        expect(source).not.toContain("../types/");
    });

    it("keeps compile lifecycle event names outside the IPC wrapper", () => {
        expect(COMPILE_STARTED_EVENT).toBe("ergo-compile-started");
        expect(COMPILE_SUCCEEDED_EVENT).toBe("ergo-compile-succeeded");
        expect(COMPILE_FAILED_EVENT).toBe("ergo-compile-failed");
    });
});
