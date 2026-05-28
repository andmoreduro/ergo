import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentProvider, useDocument } from "./DocumentContext";

describe("DocumentProvider session state", () => {
    const renderDocument = (historyLimit?: number) =>
        renderHook(() => useDocument(), {
            wrapper: ({ children }) => (
                <DocumentProvider historyLimit={historyLimit}>{children}</DocumentProvider>
            ),
        });

    it("queues the forward document event when an AST action is applied", () => {
        const { result } = renderDocument();

        act(() => {
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Draft" },
            });
        });

        expect(result.current.state.metadata.title).toBe("Draft");
        expect(result.current.events.at(-1)?.event).toEqual({
            type: "setProjectTitle",
            title: "Draft",
        });
    });

    it("marks the document dirty when an AST action is applied", () => {
        const { result } = renderDocument();

        act(() => {
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Draft" },
            });
        });

        expect(result.current.isDirty).toBe(true);
    });

    it("undo applies the inverse document event", () => {
        const { result } = renderDocument();

        act(() => {
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Draft" },
            });
        });

        act(() => result.current.undo());

        expect(result.current.state.metadata.title).toBe("Untitled Document");
        expect(result.current.canRedo).toBe(true);
        expect(result.current.events.at(-1)?.event).toEqual({
            type: "setProjectTitle",
            title: "Untitled Document",
        });
    });

    it("redo reapplies the forward document event", () => {
        const { result } = renderDocument();

        act(() => {
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Draft" },
            });
        });
        act(() => result.current.undo());

        act(() => result.current.redo());

        expect(result.current.state.metadata.title).toBe("Draft");
        expect(result.current.events.at(-1)?.event).toEqual({
            type: "setProjectTitle",
            title: "Draft",
        });
    });

    it("keeps document title metadata and input title in sync across undo and redo", () => {
        const { result } = renderDocument();

        act(() => {
            result.current.dispatch({
                type: "UPDATE_INPUT",
                payload: { path: "/title", value: "Input Title" },
            });
        });

        expect(result.current.state.inputs.title).toBe("Input Title");
        expect(result.current.state.metadata.title).toBe("Input Title");

        act(() => result.current.undo());

        expect(result.current.state.inputs.title).toBe("Untitled Document");
        expect(result.current.state.metadata.title).toBe("Untitled Document");

        act(() => result.current.redo());

        expect(result.current.state.inputs.title).toBe("Input Title");
        expect(result.current.state.metadata.title).toBe("Input Title");
    });

    it("respects the configured history limit", () => {
        const { result } = renderDocument(1);

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
        const { result } = renderDocument();
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
                        underline: null,
                        kind: null,
                        reference_id: null,
                        equation_source: null,
                        equation_syntax: "typst",
                    },
                ],
            },
        });
    });

    it("queues every backend event when undoing and redoing a multi-event conversion", () => {
        const { result } = renderDocument();
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
                    paragraphId: "convert-me",
                },
            });
            result.current.dispatch({
                type: "UPDATE_PARAGRAPH_TEXT",
                payload: {
                    paragraphId: "convert-me",
                    text: "Convertible paragraph",
                },
            });
            result.current.dispatch({
                type: "CONVERT_ELEMENT",
                payload: {
                    elementId: "convert-me",
                    targetKind: "Heading",
                },
            });
        });

        expect(result.current.events.slice(-2).map(({ event }) => event.type)).toEqual([
            "removeElement",
            "insertElement",
        ]);
        expect(
            result.current.state.sections
                .flatMap((entry) =>
                    entry.type === "Content" ? entry.elements : [],
                )
                .find((element) => element.id === "convert-me")?.type,
        ).toBe("Heading");

        act(() => result.current.undo());

        expect(result.current.events.slice(-2).map(({ event }) => event.type)).toEqual([
            "removeElement",
            "restoreElement",
        ]);
        expect(
            result.current.state.sections
                .flatMap((entry) =>
                    entry.type === "Content" ? entry.elements : [],
                )
                .find((element) => element.id === "convert-me")?.type,
        ).toBe("Paragraph");

        act(() => result.current.redo());

        expect(result.current.events.slice(-2).map(({ event }) => event.type)).toEqual([
            "removeElement",
            "insertElement",
        ]);
        expect(
            result.current.state.sections
                .flatMap((entry) =>
                    entry.type === "Content" ? entry.elements : [],
                )
                .find((element) => element.id === "convert-me")?.type,
        ).toBe("Heading");
    });

    it("prunes synced document events by acknowledged id", () => {
        const { result } = renderDocument();

        act(() => {
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Uno" },
            });
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Dos" },
            });
            result.current.dispatch({
                type: "UPDATE_PROJECT_TITLE",
                payload: { title: "Tres" },
            });
        });

        expect(result.current.events.map((event) => event.id)).toEqual([1, 2, 3]);

        act(() => result.current.ackDocumentEvents(2));

        expect(result.current.events.map((event) => event.id)).toEqual([3]);
    });
});
