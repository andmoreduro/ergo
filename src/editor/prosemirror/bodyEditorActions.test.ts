import { describe, expect, it } from "vitest";
import { bodyEditorActionHandlers } from "./bodyEditorActions";

describe("bodyEditorActionHandlers", () => {
    it("registers table and body navigation handlers", () => {
        const handlers = bodyEditorActionHandlers();
        expect(typeof handlers["editor::EnterTable"]).toBe("function");
        expect(typeof handlers["editor::BodyNavigateUp"]).toBe("function");
    });
});
