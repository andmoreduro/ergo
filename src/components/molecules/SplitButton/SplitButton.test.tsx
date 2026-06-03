import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { SplitButton } from "./SplitButton";

describe("SplitButton", () => {
    it("fires primary click and option select from chevron menu", async () => {
        const onPrimaryClick = vi.fn();
        const onOptionSelect = vi.fn();
        const host = document.createElement("div");
        document.body.appendChild(host);
        const root = createRoot(host);

        await act(async () => {
            root.render(
                createElement(SplitButton, {
                    icon: "H",
                    primaryLabel: "Insert",
                    menuLabel: "Level",
                    options: [
                        { value: "1", label: "H1" },
                        { value: "2", label: "H2" },
                    ],
                    selectedValue: "2",
                    onPrimaryClick,
                    onOptionSelect,
                }),
            );
        });

        const buttons = host.querySelectorAll("button");
        expect(buttons.length).toBeGreaterThanOrEqual(2);

        await act(async () => {
            buttons[0]!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });
        expect(onPrimaryClick).toHaveBeenCalledTimes(1);

        await act(async () => {
            buttons[1]!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });

        const menuItem = document.body.querySelector('[role="menuitem"]');
        expect(menuItem?.textContent).toBe("H1");

        await act(async () => {
            menuItem!.dispatchEvent(
                new MouseEvent("click", { bubbles: true }),
            );
        });
        expect(onOptionSelect).toHaveBeenCalledWith("1");

        await act(async () => {
            root.unmount();
        });
        host.remove();
    });
});
