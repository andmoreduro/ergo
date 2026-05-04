import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Menubar } from "./Menubar";

import "@testing-library/jest-dom";

describe("Menubar component", () => {
    it("moves the open menu when another top-level entry is hovered", () => {
        render(
            <Menubar
                activeLocale="en"
                themeMode="system"
                onLocaleChange={vi.fn()}
                onCommand={vi.fn()}
                isCommandEnabled={() => true}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "File" }));

        expect(screen.getByRole("menu", { name: "File" })).toBeInTheDocument();
        expect(screen.getByText("New Project")).toBeInTheDocument();

        fireEvent.mouseEnter(screen.getByRole("button", { name: "Edit" }));

        expect(screen.queryByRole("menu", { name: "File" })).not.toBeInTheDocument();
        expect(screen.getByRole("menu", { name: "Edit" })).toBeInTheDocument();
        expect(screen.getByText("Undo")).toBeInTheDocument();
    });
});
