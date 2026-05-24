import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentProvider } from "../../../state/DocumentContext";

import "@testing-library/jest-dom";

const useCompilerMock = vi.hoisted(() => vi.fn());

const tauriApiMock = vi.hoisted(() => ({
    getTemplateSpec: vi.fn(),
    startPreviewWatch: vi.fn(),
    stopPreviewWatch: vi.fn(),
    listenToCompileEvents: vi.fn(),
    listenToResourcesEvents: vi.fn(),
    syncDocumentSnapshot: vi.fn(),
    syncDocumentEvents: vi.fn(),
}));

vi.mock("../../../hooks/useCompiler", () => ({
    useCompiler: (...args: unknown[]) => useCompilerMock(...args),
}));

vi.mock("../../../api/tauri", () => ({
    TauriApi: tauriApiMock,
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
    inputs: [],
    groups: [],
    sections: [{ id: "body", kind: "content" }],
    custom_elements: [],
};

describe("Workspace component", () => {
    beforeEach(() => {
        useCompilerMock.mockReturnValue(defaultCompilerState());
        tauriApiMock.getTemplateSpec.mockResolvedValue(defaultTemplateSpec);
        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.listenToResourcesEvents.mockResolvedValue(() => undefined);
        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);
        tauriApiMock.stopPreviewWatch.mockResolvedValue(undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue({
            dirtyElementIds: [],
            fragmentCount: 0,
            layout: {
                documentStatePath: ".ergproj/document_state.json",
                mainPath: "main.typ",
                libPath: "lib.typ",
                projectSettingsPath: ".ergproj/project_settings.json",
                referencesPath: "references.bib",
                sectionPaths: [],
                sourceMapPath: ".ergproj/source_map.json",
                fieldSourceMapPath: ".ergproj/field_source_map.json",
                templatePath: ".ergproj/template.json",
            },
            sourceMap: [],
            fieldSourceMap: [],
            sourceRevision: 1,
        });
    });

    it("renders the Sidebar, Editor, and Preview columns", () => {
        render(
            <DocumentProvider>
                <Workspace />
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
                <Workspace />
            </DocumentProvider>,
        );

        expect(
            screen.getByRole("button", { name: /Abstract\s*Page 2/ }),
        ).toBeInTheDocument();
    });
});
