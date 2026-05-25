import { render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useInViewport } from "./useInViewport";

function ViewportProbe({
    forceVisible,
    onVisible,
}: {
    forceVisible?: boolean;
    onVisible: (visible: boolean) => void;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const targetRef = useRef<HTMLDivElement>(null);
    const visible = useInViewport(targetRef, {
        rootRef,
        forceVisible,
    });
    onVisible(visible);
    return (
        <div ref={rootRef} data-testid="root">
            <div ref={targetRef} data-testid="target" />
        </div>
    );
}

describe("useInViewport", () => {
    it("treats the target as visible when forced", () => {
        let visible = false;
        render(
            <ViewportProbe
                forceVisible
                onVisible={(next) => {
                    visible = next;
                }}
            />,
        );
        expect(visible).toBe(true);
    });

    it("uses IntersectionObserver when available", () => {
        const observe = vi.fn();
        const disconnect = vi.fn();

        vi.stubGlobal(
            "IntersectionObserver",
            class {
                constructor(
                    callback: IntersectionObserverCallback,
                    _options?: IntersectionObserverInit,
                ) {
                    callback([{ isIntersecting: true } as IntersectionObserverEntry], this);
                }
                observe = observe;
                disconnect = disconnect;
            },
        );

        let visible = false;
        render(
            <ViewportProbe
                onVisible={(next) => {
                    visible = next;
                }}
            />,
        );

        expect(observe).toHaveBeenCalled();
        expect(visible).toBe(true);

        vi.unstubAllGlobals();
    });
});
