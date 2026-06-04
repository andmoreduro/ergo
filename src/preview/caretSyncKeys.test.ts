import { describe, expect, it } from "vitest";
import { caretFetchKey } from "./caretSyncKeys";

describe("caretFetchKey", () => {
    const target = {
        elementId: "inputs",
        fieldId: "/title",
        caretUtf16Offset: 5,
    };

    it("changes when preview revision changes for native focus", () => {
        const focus = {
            focusSource: "native" as const,
            forcePreviewScroll: false,
            requestId: 1,
        };
        expect(caretFetchKey(10, target, focus)).not.toBe(
            caretFetchKey(11, target, focus),
        );
    });

    it("does not change when only caret offset changes for native focus", () => {
        const focus = {
            focusSource: "native" as const,
            forcePreviewScroll: false,
            requestId: 1,
        };
        expect(
            caretFetchKey(10, { ...target, caretUtf16Offset: 5 }, focus),
        ).toBe(caretFetchKey(10, { ...target, caretUtf16Offset: 99 }, focus));
    });

    it("changes when focus request id changes for native focus", () => {
        const base = {
            focusSource: "native" as const,
            forcePreviewScroll: false,
        };
        expect(
            caretFetchKey(10, target, { ...base, requestId: 1 }),
        ).not.toBe(caretFetchKey(10, target, { ...base, requestId: 2 }));
    });

    it("includes caret offset for preview-driven focus", () => {
        const focus = {
            focusSource: "preview" as const,
            forcePreviewScroll: false,
            requestId: 1,
        };
        expect(
            caretFetchKey(10, { ...target, caretUtf16Offset: 1 }, focus),
        ).not.toBe(
            caretFetchKey(10, { ...target, caretUtf16Offset: 2 }, focus),
        );
    });
});
