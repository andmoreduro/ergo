import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActionId } from "../bindings/ActionId";
import { createCommandRegistry } from "../commands/registry";
import type { Command, CommandContext } from "../commands/types";
import {
    ContextMenuProvider,
    useContextMenuTrigger,
} from "./ContextMenuProvider";
import type { ContextMenuSurface } from "./definitions";

import "@testing-library/jest-dom";

vi.mock("../config/debug", () => ({
    isDebugMenuEnabled: () => true,
}));

vi.mock("../api/tauri", () => ({
    TauriApi: {
        openDevTools: vi.fn().mockResolvedValue(undefined),
    },
}));

const commandContext: CommandContext = {
    hasActiveProject: true,
    focusedElementId: null,
};

const commands: Command[] = [
    {
        id: "edit::Undo",
        label: "Undo",
        scope: "project",
        isEnabled: () => true,
        run: vi.fn(),
    },
    {
        id: "edit::Redo",
        label: "Redo",
        scope: "project",
        isEnabled: () => true,
        run: vi.fn(),
    },
    {
        id: "editor::DeleteElement",
        label: "Delete Element",
        scope: "project",
        isEnabled: () => false,
        run: vi.fn(),
    },
    {
        id: "view::OpenCommandPalette",
        label: "Command Palette",
        scope: "global",
        run: vi.fn(),
    },
];

const ContextMenuSurface = ({ surface }: { surface: ContextMenuSurface }) => {
    const menuProps = useContextMenuTrigger(surface);
    return <div data-testid="surface" {...menuProps} />;
};

const renderWithMenu = (surface: ContextMenuSurface, runCommand = vi.fn()) => {
    const registry = createCommandRegistry(commands);
    return render(
        <ContextMenuProvider
            commandRegistry={registry}
            commandContext={commandContext}
            runCommand={runCommand}
        >
            <ContextMenuSurface surface={surface} />
        </ContextMenuProvider>,
    );
};

describe("ContextMenuProvider", () => {
    it("shows workspace menu entries on right-click", () => {
        renderWithMenu("workspace");

        fireEvent.contextMenu(screen.getByTestId("surface"));

        expect(screen.getByRole("menuitem", { name: "Undo" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Redo" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Cut" })).toBeDisabled();
        expect(screen.getByRole("menuitem", { name: "Copy" })).toBeDisabled();
        expect(screen.getByRole("menuitem", { name: "Paste" })).toBeDisabled();
        expect(screen.getByRole("menuitem", { name: "Delete Element" })).toBeInTheDocument();
        expect(
            screen.getByRole("menuitem", { name: "Command Palette" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Inspect" })).toBeInTheDocument();
    });

    it("runs a command when a menu item is selected", () => {
        const runCommand = vi.fn();
        renderWithMenu("workspace", runCommand);

        fireEvent.contextMenu(screen.getByTestId("surface"));
        fireEvent.click(screen.getByRole("menuitem", { name: "Undo" }));

        expect(runCommand).toHaveBeenCalledWith("edit::Undo" satisfies ActionId);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("closes when clicking outside the menu", () => {
        render(
            <ContextMenuProvider
                commandRegistry={createCommandRegistry(commands)}
                commandContext={commandContext}
                runCommand={vi.fn()}
            >
                <ContextMenuSurface surface="workspace" />
                <button type="button">Outside</button>
            </ContextMenuProvider>,
        );

        fireEvent.contextMenu(screen.getByTestId("surface"));
        expect(screen.getByRole("menu")).toBeInTheDocument();

        fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
});
