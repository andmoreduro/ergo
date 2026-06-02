import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
    clearBlockUiState,
    setBlockUiState,
} from "../../../editor/prosemirror/blockUiState";
import { useElementSettingsShortcut } from "./useElementSettingsShortcut";

describe("useElementSettingsShortcut", () => {
    const elementId = "el-test";

    beforeEach(() => {
        clearBlockUiState(elementId);
    });

    afterEach(() => {
        clearBlockUiState(elementId);
    });

    it("keeps the dialog open when toggled while the block is unfocused", () => {
        const { result } = renderHook(() => useElementSettingsShortcut(elementId));

        act(() => {
            result.current.setOpen(true);
        });

        expect(result.current.open).toBe(true);
    });

    it("closes after the block loses selected/editing focus", () => {
        setBlockUiState(elementId, { selected: true, editing: false });
        const { result, rerender } = renderHook(() =>
            useElementSettingsShortcut(elementId),
        );

        act(() => {
            result.current.setOpen(true);
        });

        act(() => {
            setBlockUiState(elementId, { selected: false, editing: false });
        });
        rerender();

        expect(result.current.open).toBe(false);
    });

    it("registers the keyboard shortcut only while editing", () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const { rerender } = renderHook(() => useElementSettingsShortcut(elementId));

        expect(addSpy).not.toHaveBeenCalledWith("keydown", expect.any(Function), true);

        act(() => {
            setBlockUiState(elementId, { selected: false, editing: true });
        });
        rerender();

        expect(addSpy).toHaveBeenCalledWith("keydown", expect.any(Function), true);
        addSpy.mockRestore();
    });
});
