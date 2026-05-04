import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom";

import { NewProjectDialog } from "./NewProjectDialog";

describe("NewProjectDialog", () => {
    const renderDialog = (
        props: Partial<ComponentProps<typeof NewProjectDialog>> = {},
    ) =>
        render(
            <NewProjectDialog
                initialProjectLocation={"C:\\Users\\ada\\Documents"}
                initialProjectName="Untitled Document"
                onCancel={() => undefined}
                onChooseLocation={async () => null}
                onCreate={() => undefined}
                {...props}
            />,
        );

    it("generates a snake-case project file name from the project name", () => {
        renderDialog();

        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "Taller: regresión con Ñ" },
        });

        expect(screen.getByLabelText("Project file name")).toHaveValue(
            "taller_regresión_con_ñ.ergproj",
        );
    });

    it("keeps the file name generated while default file name is checked", () => {
        renderDialog();

        expect(screen.getByLabelText("Default file name")).toBeChecked();
        expect(screen.getByLabelText("Project file name")).toBeDisabled();
    });

    it("keeps a manually edited project file name after disabling default file name", () => {
        renderDialog();

        fireEvent.click(screen.getByLabelText("Default file name"));
        fireEvent.change(screen.getByLabelText("Project file name"), {
            target: { value: "Mi Archivo Final.ergproj" },
        });
        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "Different Title" },
        });

        expect(screen.getByLabelText("Project file name")).toHaveValue(
            "Mi Archivo Final.ergproj",
        );
    });

    it("updates the project location from the folder picker", async () => {
        renderDialog({
            onChooseLocation: async () => "D:\\Research",
        });

        fireEvent.click(screen.getByRole("button", { name: "Choose folder" }));

        await waitFor(() =>
            expect(screen.getByLabelText("Project location")).toHaveValue(
                "D:\\Research",
            ),
        );
    });

    it("submits the project name, file name, and location", () => {
        const onCreate = vi.fn();
        renderDialog({ onCreate });

        fireEvent.change(screen.getByLabelText("Project name"), {
            target: { value: "Mi proyecto" },
        });
        fireEvent.click(screen.getByLabelText("Default file name"));
        fireEvent.change(screen.getByLabelText("Project file name"), {
            target: { value: "Archivo Final.ergproj" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Create Project" }));

        expect(onCreate).toHaveBeenCalledWith({
            projectName: "Mi proyecto",
            projectFileName: "Archivo Final.ergproj",
            projectLocation: "C:\\Users\\ada\\Documents",
        });
    });
});
