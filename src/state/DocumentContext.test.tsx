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

        act(() => result.current.undo());

        expect(result.current.state.metadata.title).toBe("Untitled Document");
        expect(result.current.canRedo).toBe(true);

        act(() => result.current.redo());

        expect(result.current.state.metadata.title).toBe("Draft");
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
});
