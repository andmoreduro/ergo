import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WelcomeScreen } from "./WelcomeScreen";

import "@testing-library/jest-dom";

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
                onCommandPalette={vi.fn()}
            />,
        );

        expect(screen.getByText("Welcome back to Érgo")).toBeInTheDocument();
        expect(screen.getByText("Get Started")).toBeInTheDocument();
        expect(screen.getByText("Recent Projects")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /new project/i }));
        expect(handleNewProject).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", { name: /open project/i }));
        expect(handleOpenProject).toHaveBeenCalledTimes(1);
    });
});
