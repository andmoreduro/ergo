import { describe, expect, it } from "vitest";
import {
    applyPreviewScrollAnchor,
    capturePreviewScrollAnchor,
} from "./previewScrollAnchor";

describe("previewScrollAnchor", () => {
    it("keeps the same content fraction under the pointer after zoom", () => {
        const vertical = document.createElement("div");
        const horizontal = document.createElement("div");
        Object.defineProperty(vertical, "scrollTop", {
            value: 100,
            writable: true,
        });
        Object.defineProperty(vertical, "scrollHeight", {
            value: 2000,
            configurable: true,
        });
        Object.defineProperty(horizontal, "scrollLeft", {
            value: 80,
            writable: true,
        });
        Object.defineProperty(horizontal, "scrollWidth", {
            value: 1600,
            configurable: true,
        });
        vertical.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 400,
                bottom: 600,
                width: 400,
                height: 600,
            }) as DOMRect;
        horizontal.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 400,
                bottom: 600,
                width: 400,
                height: 600,
            }) as DOMRect;

        const anchor = capturePreviewScrollAnchor(
            vertical,
            horizontal,
            200,
            300,
        );

        Object.defineProperty(vertical, "scrollHeight", {
            value: 4000,
            configurable: true,
        });
        Object.defineProperty(horizontal, "scrollWidth", {
            value: 3200,
            configurable: true,
        });

        applyPreviewScrollAnchor(vertical, horizontal, anchor);

        expect(vertical.scrollTop).toBe(500);
        expect(horizontal.scrollLeft).toBe(360);
    });
});
