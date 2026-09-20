import { describe, expect, it } from "vitest";
import {
    DEFAULT_PAGE_HEIGHT_PT,
    DEFAULT_PAGE_WIDTH_PT,
    pageSurfaceLayoutStyle,
    previewPointFromPageMouseEvent,
} from "./previewPageMetrics";

const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect;

const pageContentWith = (width: number, height: number) => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () => rect(0, 0, width, height);
    return element;
};

const pointerEvent = (clientX: number, clientY: number) =>
    ({ clientX, clientY }) as MouseEvent;

describe("previewPointFromPageMouseEvent", () => {
    it("maps a pointer position into page-space points", () => {
        const page = pageContentWith(400, 600);
        const point = previewPointFromPageMouseEvent(
            pointerEvent(100, 150),
            page,
            { widthPt: 612, heightPt: 792 },
        );

        expect(point).toEqual({ xPt: 612 / 4, yPt: 792 / 4 });
    });

    it("returns null for degenerate metrics or a collapsed surface", () => {
        const page = pageContentWith(400, 600);
        expect(
            previewPointFromPageMouseEvent(pointerEvent(10, 10), page, {
                widthPt: 0,
                heightPt: 792,
            }),
        ).toBeNull();
        expect(
            previewPointFromPageMouseEvent(pointerEvent(10, 10), page, {
                widthPt: Number.NaN,
                heightPt: 792,
            }),
        ).toBeNull();

        const collapsed = pageContentWith(0, 0);
        expect(
            previewPointFromPageMouseEvent(pointerEvent(10, 10), collapsed, {
                widthPt: 612,
                heightPt: 792,
            }),
        ).toBeNull();
    });
});

describe("pageSurfaceLayoutStyle", () => {
    it("returns undefined for non-positive zoom", () => {
        expect(pageSurfaceLayoutStyle(0, { widthPt: 612, heightPt: 792 })).toBeUndefined();
    });

    it("uses the US Letter fallback metrics when page metrics are unknown", () => {
        const style = pageSurfaceLayoutStyle(1, null);
        expect(style).toBeDefined();
        expect(style?.width).toBe(`${DEFAULT_PAGE_WIDTH_PT * (96 / 72)}px`);
        expect(style?.minHeight).toBe(`${DEFAULT_PAGE_HEIGHT_PT * (96 / 72)}px`);
    });

    it("scales a provided fit width by zoom", () => {
        const style = pageSurfaceLayoutStyle(2, { widthPt: 612, heightPt: 792 }, 300);
        expect(style?.width).toBe("600px");
        expect(style?.minHeight).toBe(`${(600 * 792) / 612}px`);
    });
});
