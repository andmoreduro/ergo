import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommandRegistry } from "../commands/registry";
import { createDefaultDocumentAST } from "../state/ast/defaults";
import { useAppActionHandlers } from "./useAppActionHandlers";

const emptyCommandRegistry = (): CommandRegistry => ({
    all: () => [],
    enabled: () => false,
    get: () => undefined,
    run: async () => false,
});

describe("useAppActionHandlers", () => {
    it("maps backend input focus targets to registered project input fields", () => {
        const setDocumentFocus = vi.fn();
        const { result } = renderHook(() =>
            useAppActionHandlers({
                commandContext: {
                    focusedElementId: null,
                    hasActiveProject: true,
                },
                commandRegistry: emptyCommandRegistry(),
                setDocumentFocus,
                state: createDefaultDocumentAST(),
            }),
        );

        act(() => {
            result.current["editor::FocusField"]?.({
                id: "editor::FocusField",
                payload: {
                    caretUtf16Offset: 3,
                    elementId: "inputs",
                    fieldId: "/abstract_text",
                    sourceRevision: 7,
                },
            });
        });

        expect(setDocumentFocus).toHaveBeenCalledWith({
            caretUtf16Offset: 3,
            elementId: "project",
            fieldId: "project-input-/abstract_text",
            anchorPageNumber: null,
            forcePreviewScroll: false,
            focusSource: "preview",
            sourceRevision: 7,
        });
    });
});
