import { describe, expect, it } from "vitest";
import { applyDocumentEvents } from "./documentEvents";
import { historyEntryForAstAction } from "./commitAstAction";
import { createTestDocumentAST } from "../test/documentAstFixture";
import { astReducer } from "./ast/reducer";

describe("historyEntryForAstAction", () => {
    it("applies forward events as the canonical AST update", () => {
        const ast = createTestDocumentAST();
        const action = {
            type: "UPDATE_PROJECT_TITLE" as const,
            payload: { title: "Título con ñ" },
        };

        const entry = historyEntryForAstAction(ast, action);
        expect(entry).not.toBeNull();

        const fromEvents = applyDocumentEvents(ast, entry!.forwardEvents);
        const fromReducer = astReducer(ast, action);
        expect(fromEvents).toEqual(fromReducer);
    });

    it("returns null when commit policy rejects the action", () => {
        const ast = createTestDocumentAST();
        const section = ast.sections.find((entry) => entry.type === "Content");
        if (!section || section.type !== "Content") {
            throw new Error("content section missing");
        }
        section.elements.push({
            type: "Equation",
            id: "equation-1",
            latex_source: "E=mc^2",
            is_block: false,
            syntax: "typst",
        });
        const action = {
            type: "UPDATE_EQUATION" as const,
            payload: {
                equationId: "equation-1",
                latexSource: "E=mc^2 ",
            },
        };

        expect(historyEntryForAstAction(ast, action)).toBeNull();
    });
});
