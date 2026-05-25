import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentProvider } from "../../../state/DocumentContext";

import "@testing-library/jest-dom";

const useCompilerMock = vi.hoisted(() => vi.fn());

const tauriApiMock = vi.hoisted(() => ({
    getTemplateSpec: vi.fn(),
}));

vi.mock("../../../hooks/useCompiler", () => ({
    useCompiler: (...args: unknown[]) => useCompilerMock(...args),
}));

vi.mock("../../../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

vi.mock("../../../contextMenu/ContextMenuProvider", () => ({
    useContextMenuTrigger: () => ({}),
}));

import { Workspace } from "./Workspace";

const defaultCompilerState = () => ({
    previewPages: [],
    isCompiling: false,
    error: null,
    sourceMap: [],
    previewRevision: null,
    outline: null,
    resources: null,
    latencyMs: null,
});

const defaultTemplateSpec = {
    template: { id: "versatile-apa", name: "APA 7th Edition", version: "1.0.0" },
    package: { name: "@preview/versatile-apa", version: "7.2.0" },
    variants: [],
    inputs: [],
    groups: [],
    sections: [{ id: "body", kind: "content" }],
    custom_elements: [],
};

describe("Workspace component", () => {
    beforeEach(() => {
        useCompilerMock.mockReturnValue(defaultCompilerState());
        tauriApiMock.getTemplateSpec.mockResolvedValue(defaultTemplateSpec);

        class ResizeObserverMock {
            observe() {}
            disconnect() {}
            unobserve() {}
        }

        vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    });

    it("renders the Sidebar, Editor, and Preview columns", () => {
        render(
            <DocumentProvider>
                <Workspace
                    previewZoom={1}
                    onPreviewZoomChange={() => undefined}
                    previewZoomRenderDebounceMs={0}
                    onExportDocument={() => undefined}
                />
            </DocumentProvider>,
        );

        expect(screen.queryByText("Document Structure")).not.toBeInTheDocument();
        expect(screen.getByText("Outline")).toBeInTheDocument();
        expect(screen.getByText("Bibliography")).toBeInTheDocument();
        expect(screen.getByText("Resources")).toBeInTheDocument();
    });

    it("routes preview outline updates into the sidebar", () => {
        useCompilerMock.mockReturnValue({
            ...defaultCompilerState(),
            outline: {
                entries: [{ level: 1, text: "Abstract", page: 2 }],
            },
            previewRevision: 8,
        });

        render(
            <DocumentProvider>
                <Workspace
                    previewZoom={1}
                    onPreviewZoomChange={() => undefined}
                    previewZoomRenderDebounceMs={0}
                    onExportDocument={() => undefined}
                />
            </DocumentProvider>,
        );

        expect(
            screen.getByRole("button", { name: /Abstract\s*Page 2/ }),
        ).toBeInTheDocument();
    });
});
