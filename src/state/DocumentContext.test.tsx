import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentProvider, useDocument } from "./DocumentContext";

describe("DocumentProvider session state", () => {
    it("tracks dirty state and restores document changes with undo and redo", () => {
        const { result } = renderHook(() => useDocument(), {
            wrapper: ({ children }) => (
                <DocumentProvider>{children}</DocumentProvider>
            ),
        });

        act(() => {
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Draft" },
            });
        });

        expect(result.current.state.metadata.title).toBe("Draft");
        expect(result.current.isDirty).toBe(true);
        expect(result.current.canUndo).toBe(true);
        expect(result.current.events.at(-1)?.event).toEqual({
            type: "setProjectTitle",
            title: "Draft",
        });

        act(() => result.current.undo());

        expect(result.current.state.metadata.title).toBe("Untitled Document");
        expect(result.current.canRedo).toBe(true);
        expect(result.current.events.at(-1)?.event).toEqual({
            type: "setProjectTitle",
            title: "Untitled Document",
        });

        act(() => result.current.redo());

        expect(result.current.state.metadata.title).toBe("Draft");
        expect(result.current.events.at(-1)?.event).toEqual({
            type: "setProjectTitle",
            title: "Draft",
        });
    });

    it("respects the configured history limit", () => {
        const { result } = renderHook(() => useDocument(), {
            wrapper: ({ children }) => (
                <DocumentProvider historyLimit={1}>{children}</DocumentProvider>
            ),
        });

        act(() => {
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "First" },
            });
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Second" },
            });
        });

        act(() => result.current.undo());
        act(() => result.current.undo());

        expect(result.current.state.metadata.title).toBe("First");
    });

    it("stores restore payloads for destructive undo events", () => {
        const { result } = renderHook(() => useDocument(), {
            wrapper: ({ children }) => (
                <DocumentProvider>{children}</DocumentProvider>
            ),
        });
        const section = result.current.state.sections.find(
            (entry) => entry.type === "Content",
        );
        if (!section || section.type !== "Content") {
            throw new Error("content section missing");
        }

        act(() => {
            result.current.dispatch({
                type: "ADD_PARAGRAPH",
                payload: {
                    sectionId: section.id,
                    paragraphId: "paragraph-1",
                },
            });
        });
        act(() => {
            result.current.dispatch({
                type: "UPDATE_PARAGRAPH_TEXT",
                payload: {
                    paragraphId: "paragraph-1",
                    text: "Contenido con ñ",
                },
            });
        });
        act(() => {
            result.current.dispatch({
                type: "REMOVE_ELEMENT",
                payload: { elementId: "paragraph-1" },
            });
        });

        act(() => result.current.undo());

        expect(result.current.events.at(-1)?.event).toEqual({
            type: "restoreElement",
            section_id: section.id,
            index: 0,
            element: {
                type: "Paragraph",
                id: "paragraph-1",
                content: [
                    {
                        text: "Contenido con ñ",
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
