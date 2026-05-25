import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePreviewZoomInput } from "./usePreviewZoomInput";
import { createRef } from "react";

describe("usePreviewZoomInput", () => {
    it("applies continuous ctrl+wheel zoom on the scroll viewport", () => {
        const scrollArea = document.createElement("div");
        const scrollRef = createRef<HTMLDivElement>();
        (scrollRef as { current: HTMLDivElement }).current = scrollArea;

        const onZoomChange = vi.fn((updater: (z: number) => number) => {
            const next =
                typeof updater === "function" ? updater(1) : updater;
            return next;
        });

        renderHook(() =>
            usePreviewZoomInput(scrollRef, 1, onZoomChange as never),
        );

        act(() => {
            scrollArea.dispatchEvent(
                new WheelEvent("wheel", {
                    deltaY: -120,
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });

        expect(onZoomChange).toHaveBeenCalled();
        const updater = onZoomChange.mock.calls[0][0] as (z: number) => number;
        expect(updater(1)).toBeGreaterThan(1);
    });
});
