import { describe, expect, it, vi } from "vitest";
import {
    focusWrapperAtCoords,
    focusWrapperPrimary,
    handleWrapperTabKeyDown,
} from "./wrapperTabCycle";

const mount = (html: string) => {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
};

describe("handleWrapperTabKeyDown", () => {
    it("moves from primary to the first extra on Tab", () => {
        const root = mount(`
      <div data-wrapper-tab="primary"><textarea id="p"></textarea></div>
      <div data-wrapper-tab="extra" data-wrapper-tab-index="0"><input id="e0" /></div>
      <div data-wrapper-tab="extra" data-wrapper-tab-index="1"><input id="e1" /></div>
    `);
        const primary = root.querySelector<HTMLTextAreaElement>("#p")!;
        const extra0 = root.querySelector<HTMLInputElement>("#e0")!;
        primary.focus();
        const event = {
            key: "Tab",
            shiftKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };
        expect(handleWrapperTabKeyDown(event, root)).toBe(true);
        expect(document.activeElement).toBe(extra0);
        root.remove();
    });

    it("wraps from the last extra back to primary on Tab", () => {
        const root = mount(`
      <div data-wrapper-tab="primary"><textarea id="p"></textarea></div>
      <div data-wrapper-tab="extra" data-wrapper-tab-index="0"><input id="e0" /></div>
    `);
        const primary = root.querySelector<HTMLTextAreaElement>("#p")!;
        const extra0 = root.querySelector<HTMLInputElement>("#e0")!;
        extra0.focus();
        const event = {
            key: "Tab",
            shiftKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };
        expect(handleWrapperTabKeyDown(event, root)).toBe(true);
        expect(document.activeElement).toBe(primary);
        root.remove();
    });

    it("jumps from chrome controls to primary on Tab", () => {
        const root = mount(`
      <div data-wrapper-tab-ignore><button id="cog">settings</button></div>
      <div data-wrapper-tab="primary"><textarea id="p"></textarea></div>
      <div data-wrapper-tab="extra" data-wrapper-tab-index="0"><input id="e0" /></div>
    `);
        const primary = root.querySelector<HTMLTextAreaElement>("#p")!;
        root.querySelector<HTMLButtonElement>("#cog")!.focus();
        const event = {
            key: "Tab",
            shiftKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };
        expect(handleWrapperTabKeyDown(event, root)).toBe(true);
        expect(document.activeElement).toBe(primary);
        root.remove();
    });
});

const mockRect = (
    element: HTMLElement,
    rect: Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">,
) => {
    element.getBoundingClientRect = () => rect as DOMRect;
};

describe("focusWrapperAtCoords", () => {
    it("focuses the field under the pointer when entering edit mode", () => {
        const root = mount(`
      <div data-wrapper-tab="primary"><textarea id="p"></textarea></div>
      <div data-wrapper-tab="extra" data-wrapper-tab-index="0"><input id="e0" /></div>
    `);
        const primary = root.querySelector<HTMLTextAreaElement>("#p")!;
        const extra0 = root.querySelector<HTMLInputElement>("#e0")!;
        mockRect(primary, {
            left: 0,
            top: 0,
            right: 100,
            bottom: 24,
            width: 100,
            height: 24,
        });
        mockRect(extra0, {
            left: 0,
            top: 32,
            right: 100,
            bottom: 56,
            width: 100,
            height: 24,
        });
        expect(focusWrapperAtCoords(root, 50, 40)).toBe(true);
        expect(document.activeElement).toBe(extra0);
        root.remove();
    });

    it("falls back to primary when the click is outside field bounds", () => {
        const root = mount(`
      <div data-wrapper-tab="primary"><textarea id="p"></textarea></div>
      <div data-wrapper-tab="extra" data-wrapper-tab-index="0"><input id="e0" /></div>
    `);
        const primary = root.querySelector<HTMLTextAreaElement>("#p")!;
        const extra0 = root.querySelector<HTMLInputElement>("#e0")!;
        mockRect(primary, {
            left: 0,
            top: 0,
            right: 100,
            bottom: 24,
            width: 100,
            height: 24,
        });
        mockRect(extra0, {
            left: 0,
            top: 32,
            right: 100,
            bottom: 56,
            width: 100,
            height: 24,
        });
        expect(focusWrapperAtCoords(root, 50, 200)).toBe(true);
        expect(document.activeElement).toBe(primary);
        root.remove();
    });
});

describe("focusWrapperPrimary", () => {
    it("prefers the textarea inside the primary slot", () => {
        const root = mount(`
      <div data-wrapper-tab-ignore><button id="cog"></button></div>
      <div data-wrapper-tab="primary">
        <button id="pick"></button>
        <textarea id="p"></textarea>
      </div>
    `);
        const textarea = root.querySelector<HTMLTextAreaElement>("#p")!;
        expect(focusWrapperPrimary(root)).toBe(true);
        expect(document.activeElement).toBe(textarea);
        root.remove();
    });
});
