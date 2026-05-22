import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentProvider } from "../../../state/DocumentContext";

import "@testing-library/jest-dom";

vi.mock("../Preview/Preview", () => ({
    Preview: ({
        onOutlineChange,
        onPreviewRevisionChange,
    }: {
        onOutlineChange?: (outline: {
            entries: Array<{ level: number; text: string; page: number }>;
        }) => void;
        onPreviewRevisionChange?: (revision: number | null) => void;
    }) => (
        <button
            type="button"
            onClick={() => {
                onPreviewRevisionChange?.(8);
                onOutlineChange?.({
                    entries: [{ level: 1, text: "Abstract", page: 2 }],
                });
            }}
        >
            Preview Column
        </button>
    ),
}));

import { Workspace } from "./Workspace";

describe("Workspace component", () => {
    it("renders the Sidebar, Editor, and Preview columns", () => {
        render(
            <DocumentProvider>
                <Workspace />
            </DocumentProvider>,
        );

        // Check Sidebar content
        expect(screen.queryByText("Document Structure")).not.toBeInTheDocument();
        expect(screen.getByText("Outline")).toBeInTheDocument();
        expect(screen.getByText("Bibliography")).toBeInTheDocument();
        expect(screen.getByText("Resources")).toBeInTheDocument();

        // Check Preview content
        expect(screen.getByText("Preview Column")).toBeInTheDocument();
    });

    it("routes preview outline updates into the sidebar", () => {
        render(
            <DocumentProvider>
                <Workspace />
            </DocumentProvider>,
        );

        fireEvent.click(screen.getByText("Preview Column"));

        expect(
            screen.getByRole("button", { name: /Abstract\s*Page 2/ }),
        ).toBeInTheDocument();
    });
});
