import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@testing-library/jest-dom";

const dialogMock = vi.hoisted(() => ({
    open: vi.fn(),
    save: vi.fn(),
}));

const tauriApiMock = vi.hoisted(() => ({
    loadGlobalSettings: vi.fn(),
    saveGlobalSettings: vi.fn(),
    loadKeymapSettings: vi.fn(),
    saveKeymapSettings: vi.fn(),
    saveProject: vi.fn(),
    openProject: vi.fn(),
    enqueueExport: vi.fn(),
    documentDir: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: dialogMock.open,
    save: dialogMock.save,
}));

vi.mock("./api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

vi.mock("./components/layout/Workspace/Workspace", async () => {
    const React = await import("react");

    return {
        Workspace: () =>
            React.createElement(
                "div",
                { "data-testid": "workspace" },
                "Workspace",
            ),
    };
});

import App from "./App";
import { DEFAULT_GLOBAL_SETTINGS } from "./settings/defaults";
import { createDefaultDocumentAST } from "./state/ast/defaults";

const astMatcherForTitle = (title: string) => expect.objectContaining({
    metadata: expect.objectContaining({
        title,
    }),
});

describe("App project lifecycle", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.documentElement.removeAttribute("data-theme");

        tauriApiMock.loadGlobalSettings.mockResolvedValue({
            ...DEFAULT_GLOBAL_SETTINGS,
            recent_projects: [],
            keymap_overrides: [],
        });
        tauriApiMock.saveGlobalSettings.mockResolvedValue(undefined);
        tauriApiMock.loadKeymapSettings.mockResolvedValue({
            keymap_profile: "Default",
            keymap_bindings: [],
            keymap_overrides: [],
        });
        tauriApiMock.saveKeymapSettings.mockResolvedValue(undefined);
        tauriApiMock.saveProject.mockResolvedValue(undefined);
        tauriApiMock.openProject.mockResolvedValue(createDefaultDocumentAST());
        tauriApiMock.documentDir.mockResolvedValue("C:\\Users\\ada\\Documents");
        tauriApiMock.enqueueExport.mockResolvedValue({
            job_id: 1,
            kind: { type: "export", format: "Svg" },
            priority: "Export",
            source_revision: 0,
        });
    });

    it("creates a new .ergproj archive inside the selected folder", async () => {
        dialogMock.open.mockResolvedValue("C:\\Users\\ada\\Documents");

        render(<App />);

        fireEvent.click(
            await screen.findByRole("button", { name: /New Project/ }),
        );
        expect(dialogMock.open).not.toHaveBeenCalled();

        fireEvent.change(await screen.findByLabelText("Project name"), {
            target: { value: "Taller: regresión con Ñ" },
        });
        expect(screen.getByLabelText("Project file name")).toHaveValue(
            "taller_regresión_con_ñ.ergproj",
        );
        fireEvent.click(screen.getByRole("button", { name: "Create Project" }));

        await waitFor(() =>
            expect(tauriApiMock.saveProject).toHaveBeenCalledWith(
                "C:\\Users\\ada\\Documents\\taller_regresión_con_ñ.ergproj",
                astMatcherForTitle("Taller: regresión con Ñ"),
            ),
        );
        expect(tauriApiMock.documentDir).toHaveBeenCalled();
        expect(dialogMock.open).not.toHaveBeenCalled();
        expect(dialogMock.save).not.toHaveBeenCalled();
        expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });

    it("chooses a different project folder from the setup dialog", async () => {
        dialogMock.open.mockResolvedValue("D:\\Research");

        render(<App />);

        fireEvent.click(
            await screen.findByRole("button", { name: /New Project/ }),
        );
        await screen.findByRole("dialog", { name: "New Project" });
        fireEvent.click(await screen.findByRole("button", { name: "Choose folder" }));
        await waitFor(() =>
            expect(screen.getByLabelText("Project location")).toHaveValue(
                "D:\\Research",
            ),
        );
        fireEvent.click(screen.getByRole("button", { name: "Create Project" }));

        await waitFor(() =>
            expect(tauriApiMock.saveProject).toHaveBeenCalledWith(
                "D:\\Research\\untitled_document.ergproj",
                astMatcherForTitle("Untitled Document"),
            ),
        );
        expect(dialogMock.open).toHaveBeenCalledWith(
            expect.objectContaining({
                directory: true,
                multiple: false,
            }),
        );
    });

    it("keeps the setup dialog open when choosing a folder is cancelled", async () => {
        dialogMock.open.mockResolvedValue(null);

        render(<App />);

        fireEvent.click(
            await screen.findByRole("button", { name: /New Project/ }),
        );
        await screen.findByRole("dialog", { name: "New Project" });
        fireEvent.click(await screen.findByRole("button", { name: "Choose folder" }));

        await waitFor(() => expect(dialogMock.open).toHaveBeenCalled());
        expect(screen.getByRole("dialog", { name: "New Project" })).toBeInTheDocument();
        expect(screen.getByLabelText("Project location")).toHaveValue(
            "C:\\Users\\ada\\Documents",
        );
    });

    it("cancels new project setup without opening the folder picker", async () => {
        render(<App />);

        fireEvent.click(
            await screen.findByRole("button", { name: /New Project/ }),
        );
        fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

        expect(dialogMock.open).not.toHaveBeenCalled();
        expect(tauriApiMock.saveProject).not.toHaveBeenCalled();
        expect(
            screen.queryByRole("dialog", { name: "New Project" }),
        ).not.toBeInTheDocument();
    });

    it("opens an existing .ergproj archive selected from the file dialog", async () => {
        const ast = createDefaultDocumentAST();
        ast.metadata.title = "Opened Project";
        dialogMock.open.mockResolvedValue("C:\\Users\\ada\\Paper.ergproj");
        tauriApiMock.openProject.mockResolvedValue(ast);

        render(<App />);

        fireEvent.click(
            await screen.findByRole("button", { name: /Open Project/ }),
        );

        await waitFor(() =>
            expect(tauriApiMock.openProject).toHaveBeenCalledWith(
                "C:\\Users\\ada\\Paper.ergproj",
            ),
        );
        expect(dialogMock.open).toHaveBeenCalledWith(
            expect.objectContaining({
                multiple: false,
                filters: [{ name: "Érgo Project", extensions: ["ergproj"] }],
            }),
        );
        expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });

    it("normalizes recent project paths to .ergproj before opening", async () => {
        tauriApiMock.loadGlobalSettings.mockResolvedValue({
            ...DEFAULT_GLOBAL_SETTINGS,
            recent_projects: ["C:\\Users\\ada\\Draft"],
            keymap_overrides: [],
        });

        render(<App />);

        fireEvent.click(await screen.findByRole("button", { name: /Draft/ }));

        await waitFor(() =>
            expect(tauriApiMock.openProject).toHaveBeenCalledWith(
                "C:\\Users\\ada\\Draft.ergproj",
            ),
        );
        expect(screen.getByTestId("workspace")).toBeInTheDocument();
    });

    it("keeps the created .ergproj path for later saves", async () => {
        dialogMock.open.mockResolvedValue("C:\\Users\\ada\\Documents");

        render(<App />);

        fireEvent.click(
            await screen.findByRole("button", { name: /New Project/ }),
        );
        fireEvent.click(
            await screen.findByRole("button", { name: "Create Project" }),
        );

        await waitFor(() =>
            expect(tauriApiMock.saveProject).toHaveBeenCalledTimes(1),
        );

        fireEvent.click(screen.getByRole("button", { name: "File" }));
        fireEvent.click(screen.getByRole("menuitem", { name: "Save Project" }));

        await waitFor(() =>
            expect(tauriApiMock.saveProject).toHaveBeenCalledTimes(2),
        );
        expect(dialogMock.save).not.toHaveBeenCalled();
        expect(tauriApiMock.saveProject).toHaveBeenLastCalledWith(
            "C:\\Users\\ada\\Documents\\untitled_document.ergproj",
            astMatcherForTitle("Untitled Document"),
        );
    });
});
