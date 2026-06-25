import { describe, expect, it, vi } from "vitest";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import { typedHandler } from "../actions/runtime";
import type { PayloadOf } from "./actionPayloads";

// Compile-time assertions: if the payload map drifts, tsc fails here.
// ` satisfies` checks the value matches the declared type without emitting
// runtime code that would break in the test environment.
void ({
    rowIndex: 0,
}) satisfies PayloadOf<"editor::RemoveTableRow">;
void ({
    percent: 100,
}) satisfies PayloadOf<"view::SetZoomPercent">;
// Unmapped actions resolve to `unknown`.
void (null) satisfies PayloadOf<"editor::InsertParagraph">;

describe("typedHandler", () => {
    it("passes the narrowed payload to the handler", () => {
        const handler = vi.fn(() => true);
        const wrapped = typedHandler("view::SetZoomPercent", handler);
        const invocation: ActionInvocation = {
            id: "view::SetZoomPercent",
            payload: { percent: 150 },
        };

        const result = wrapped(invocation);

        expect(result).toBe(true);
        expect(handler).toHaveBeenCalledWith({ percent: 150 }, invocation);
    });

    it("passes null payloads through", () => {
        const handler = vi.fn(() => false);
        const wrapped = typedHandler("editor::InsertParagraph", handler);
        const invocation: ActionInvocation = {
            id: "editor::InsertParagraph",
            payload: null,
        };

        wrapped(invocation);

        expect(handler).toHaveBeenCalledWith(null, invocation);
    });
});
