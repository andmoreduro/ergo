import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WelcomeScreen } from "./WelcomeScreen";

import "@testing-library/jest-dom";

vi.mock("../../../contextMenu/ContextMenuProvider", () => ({
    useContextMenuTrigger: () => ({}),
}));

describe("WelcomeScreen component", () => {
    it("renders startup actions and recent projects", () => {
        const handleNewProject = vi.fn();
        const handleOpenProject = vi.fn();

        render(
            <WelcomeScreen
                recentProjects={["ergo", "taller_ml_linear_regression"]}
                onNewProject={handleNewProject}
                onOpenProject={handleOpenProject}
                onOpenRecentProject={handleOpenProject}
                onRemoveRecentProject={vi.fn()}
                onCommandPalette={vi.fn()}
            />,
        );

        expect(screen.getByRole("img", { name: "App icon" })).toBeInTheDocument();
        expect(screen.getByText("Welcome back to Érgo")).toBeInTheDocument();
        expect(screen.getByText("Get Started")).toBeInTheDocument();
        expect(screen.getByText("Recent Projects")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /new project/i }));
        expect(handleNewProject).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: /open project/i }));
        expect(handleOpenProject).toHaveBeenCalledTimes(1);
    });

    it("removes a recent project without opening it", () => {
        const handleOpenRecentProject = vi.fn();
        const handleRemoveRecentProject = vi.fn();

        render(
            <WelcomeScreen
                recentProjects={["C:\\Users\\ada\\Draft.ergproj"]}
                onNewProject={vi.fn()}
                onOpenProject={vi.fn()}
                onOpenRecentProject={handleOpenRecentProject}
                onRemoveRecentProject={handleRemoveRecentProject}
                onCommandPalette={vi.fn()}
            />,
        );

        fireEvent.click(
            screen.getByRole("button", {
                name: "Remove from recent projects",
            }),
        );

        expect(handleRemoveRecentProject).toHaveBeenCalledWith(
            "C:\\Users\\ada\\Draft.ergproj",
        );
        expect(handleOpenRecentProject).not.toHaveBeenCalled();
    });
});
