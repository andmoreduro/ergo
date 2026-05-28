import { describe, expect, it, vi } from "vitest";
import {
    closestElementBlock,
    focusClosestContentField,
    firstEditorFieldInBlock,
    isContentSectionFocusDelegationTarget,
    isContentSectionPointerFocusTarget,
} from "./contentSectionFocus";

describe("contentSectionFocus", () => {
    it("picks the geometrically closest element block", () => {
        const section = document.createElement("div");
        const blockA = document.createElement("div");
        blockA.dataset.elementId = "a";
        const blockB = document.createElement("div");
        blockB.dataset.elementId = "b";
        section.append(blockA, blockB);

        blockA.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 100,
                bottom: 40,
                width: 100,
                height: 40,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;
        blockB.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 80,
                right: 100,
                bottom: 120,
                width: 100,
                height: 40,
                x: 0,
                y: 80,
                toJSON: () => ({}),
            }) as DOMRect;

        expect(closestElementBlock(section, 10, 70)?.dataset.elementId).toBe("b");
    });

    it("returns the first editor field in DOM order", () => {
        const block = document.createElement("div");
        block.innerHTML = `
            <div data-editor-field-id="primary" tabindex="0">Primary</div>
            <div data-editor-field-id="secondary" tabindex="0">Secondary</div>
        `;

        expect(firstEditorFieldInBlock(block)?.dataset.editorFieldId).toBe(
            "primary",
        );
    });

    it("focuses the first field in the clicked element block", () => {
        const section = document.createElement("div");
        section.innerHTML = `
            <div data-element-id="p1" style="padding: 8px;">
                <div data-editor-field-id="p1:text" tabindex="0">One</div>
            </div>
            <div data-element-id="p2" style="padding: 8px; margin-top: 40px;">
                <div data-editor-field-id="p2:text" tabindex="0">Two</div>
            </div>
        `;
        document.body.append(section);

        const primary = section.querySelector<HTMLElement>(
            '[data-editor-field-id="p1:text"]',
        )!;
        const secondary = section.querySelector<HTMLElement>(
            '[data-editor-field-id="p2:text"]',
        )!;
        const focusSpy = vi.spyOn(primary, "focus");

        const block = section.querySelector<HTMLElement>('[data-element-id="p1"]')!;
        const focused = focusClosestContentField(section, block, 20, 20);

        expect(focused).toBe(true);
        expect(focusSpy).toHaveBeenCalled();
        expect(document.activeElement).not.toBe(secondary);

        focusSpy.mockRestore();
        section.remove();
    });

    it("detects empty-space clicks inside the content section", () => {
        const section = document.createElement("div");
        section.setAttribute("data-content-section", "");
        const block = document.createElement("div");
        block.dataset.elementId = "p1";
        section.append(block);

        expect(isContentSectionPointerFocusTarget(block)).toBe(true);
        expect(
            isContentSectionPointerFocusTarget(document.createElement("div")),
        ).toBe(false);
    });

    it("ignores clicks on buttons and existing editor fields", () => {
        const button = document.createElement("button");
        const field = document.createElement("div");
        field.setAttribute("data-editor-field-id", "field");

        expect(isContentSectionFocusDelegationTarget(button)).toBe(false);
        expect(isContentSectionFocusDelegationTarget(field)).toBe(false);
        expect(
            isContentSectionFocusDelegationTarget(document.createElement("p")),
        ).toBe(true);
    });
});
