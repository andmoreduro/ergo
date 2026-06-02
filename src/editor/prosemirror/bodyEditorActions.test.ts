import { describe, expect, it } from "vitest";
import { bodyEditorActionHandlers } from "./bodyEditorActions";

describe("bodyEditorActionHandlers", () => {
    it("registers table and body navigation handlers", () => {
        const handlers = bodyEditorActionHandlers();
        expect(typeof handlers["editor::EnterTable"]).toBe("function");
        expect(typeof handlers["editor::Tab"]).toBe("function");
        expect(typeof handlers["editor::BodyNavigateUp"]).toBe("function");
    });

    it("swallows toolbar-locked insert actions while a table cell is active", () => {
        const handlers = bodyEditorActionHandlers();
        expect(handlers["editor::InsertHeading"]).toBeDefined();
        expect(handlers["editor::InsertTable"]).toBeDefined();
        expect(handlers["editor::InsertFigure"]).toBeDefined();
        expect(handlers["editor::InsertDiagram"]).toBeDefined();
    });
});
