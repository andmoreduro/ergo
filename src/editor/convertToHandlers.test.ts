import { describe, expect, it, vi } from "vitest";
import type { DocumentElement } from "../bindings/DocumentElement";
import type { ASTAction } from "../state/ast/actions";
import { convertToHandlers } from "./convertToHandlers";

const makeParagraph = (id: string): DocumentElement => ({
    type: "Paragraph",
    id,
    content: [],
});

describe("convertToHandlers", () => {
    it("dispatches CONVERT_ELEMENT for each ConvertTo* action with the focused element id", () => {
        const dispatch = vi.fn();
        const handlers = convertToHandlers(
            () => makeParagraph("el-1"),
            dispatch as unknown as (action: ASTAction) => void,
        );

        const cases: Array<{ id: keyof typeof handlers; targetKind: string }> = [
            { id: "editor::ConvertToParagraph", targetKind: "Paragraph" },
            { id: "editor::ConvertToHeading", targetKind: "Heading" },
            { id: "editor::ConvertToTable", targetKind: "Table" },
            { id: "editor::ConvertToEquation", targetKind: "Equation" },
            { id: "editor::ConvertToFigure", targetKind: "Figure" },
        ];

        for (const { id, targetKind } of cases) {
            const handler = handlers[id];
            expect(handler).toBeDefined();
            const result = handler?.({ id, payload: null });
            expect(result).toBe(true);
            expect(dispatch).toHaveBeenCalledWith({
                type: "CONVERT_ELEMENT",
                payload: { elementId: "el-1", targetKind },
            });
        }
        expect(dispatch).toHaveBeenCalledTimes(cases.length);
    });

    it("returns false (no-op) when no element is focused", () => {
        const dispatch = vi.fn();
        const handlers = convertToHandlers(
            () => null,
            dispatch as unknown as (action: ASTAction) => void,
        );

        const result = handlers["editor::ConvertToParagraph"]?.({
            id: "editor::ConvertToParagraph",
            payload: null,
        });
        expect(result).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });
});
