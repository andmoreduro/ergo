import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Menubar } from "./Menubar";

import "@testing-library/jest-dom";

const windowApiMock = vi.hoisted(() => ({
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
    getCurrentWindow: vi.fn(() => windowApiMock),
}));

describe("Menubar component", () => {
    it("moves the open menu when another top-level entry is hovered", () => {
        render(
            <Menubar
                hasActiveProject
                themeMode="system"
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

    it("uses the menubar as a draggable titlebar with window controls", () => {
        render(
            <Menubar
                hasActiveProject={false}
                themeMode="system"
                onCommand={vi.fn()}
                isCommandEnabled={() => true}
            />,
        );

        expect(screen.getByRole("navigation")).toHaveAttribute(
            "data-tauri-drag-region",
            "",
        );
        expect(screen.queryByLabelText("Language")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
        fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(windowApiMock.minimize).toHaveBeenCalled();
        expect(windowApiMock.toggleMaximize).toHaveBeenCalled();
        expect(windowApiMock.close).toHaveBeenCalled();
    });

    it("hides project-only menubar entries until a project is open", () => {
        const { rerender } = render(
            <Menubar
                hasActiveProject={false}
                themeMode="system"
                onCommand={vi.fn()}
                isCommandEnabled={() => true}
            />,
        );

        expect(screen.getByRole("button", { name: "File" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Insert" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Project" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "File" }));
        expect(screen.queryByRole("menuitem", { name: "Save Project" })).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Export" })).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Close Project" })).not.toBeInTheDocument();

        rerender(
            <Menubar
                hasActiveProject
                themeMode="system"
                onCommand={vi.fn()}
                isCommandEnabled={() => true}
            />,
        );

        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Insert" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Project" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Project" }));
        expect(screen.getByRole("menuitem", { name: "Project Settings" })).toBeInTheDocument();
    });
});
