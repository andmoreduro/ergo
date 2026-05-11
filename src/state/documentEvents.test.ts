import { describe, expect, it } from "vitest";
import { createDocumentEventHistoryEntry } from "./documentEvents";
import { createDefaultDocumentAST } from "./ast/defaults";
import { astReducer } from "./ast/reducer";
import type { ASTAction } from "./ast/actions";

describe("document event conversion", () => {
    it("maps project title actions to sync events and inverse events", () => {
        const previousAst = createDefaultDocumentAST();
        const action: ASTAction = {
            type: "UPDATE_PROJECT_TITLE",
            payload: { title: "Borrador con ñ" },
        };
        const nextAst = astReducer(previousAst, action);

        const entry = createDocumentEventHistoryEntry(previousAst, action, nextAst);

        expect(entry.forwardEvent).toEqual({
            type: "setProjectTitle",
            title: "Borrador con ñ",
        });
        expect(entry.inverseEvent).toEqual({
            type: "setProjectTitle",
            title: "Untitled Document",
        });
    });

    it("stores removed element data and position in restore inverse events", () => {
        let previousAst = createDefaultDocumentAST();
        const contentSection = previousAst.sections.find(
            (section) => section.type === "Content",
        );
        if (!contentSection || contentSection.type !== "Content") {
            throw new Error("content section missing");
        }
        previousAst = astReducer(previousAst, {
            type: "ADD_PARAGRAPH",
            payload: {
                sectionId: contentSection.id,
                paragraphId: "paragraph-1",
            },
        });
        previousAst = astReducer(previousAst, {
            type: "UPDATE_PARAGRAPH_TEXT",
            payload: {
                paragraphId: "paragraph-1",
                text: "Texto eliminado",
            },
        });
        const action: ASTAction = {
            type: "REMOVE_ELEMENT",
            payload: { elementId: "paragraph-1" },
        };
        const nextAst = astReducer(previousAst, action);

        const entry = createDocumentEventHistoryEntry(previousAst, action, nextAst);

        expect(entry.forwardEvent).toEqual({
            type: "removeElement",
            element_id: "paragraph-1",
        });
        expect(entry.inverseEvent).toEqual({
            type: "restoreElement",
            section_id: contentSection.id,
            index: 0,
            element: {
                type: "Paragraph",
                id: "paragraph-1",
                content: [
                    {
                        text: "Texto eliminado",
                        bold: null,
                        italic: null,
                        kind: null,
                        reference_id: null,
                        equation_source: null,
                    },
                ],
            },
        });
    });
});
