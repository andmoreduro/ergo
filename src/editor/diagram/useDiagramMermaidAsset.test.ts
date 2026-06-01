import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDiagramMermaidAsset } from "./useDiagramMermaidAsset";

vi.mock("../../api/tauri", () => ({
    TauriApi: {
        writeGeneratedAsset: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock("../../workers/compilerClient", () => ({
    CompilerClient: {
        writeFile: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock("./renderMermaidSvg", () => ({
    renderMermaidSvg: vi.fn().mockResolvedValue("<svg></svg>"),
}));

vi.mock(
    "../../components/organisms/ElementEditor/figure/useFigureImagePreview",
    () => ({
        useFigureImagePreview: () => ({
            previewUrl: "blob:preview",
            updatePreviewUrl: vi.fn(),
        }),
    }),
);

const dispatch = vi.fn();
vi.mock("../../state/DocumentContext", () => ({
    useDocumentAst: () => ({
        state: { assets: [] },
        dispatch,
    }),
}));

describe("useDiagramMermaidAsset", () => {
    beforeEach(() => {
        dispatch.mockClear();
    });

    it("renders mermaid on mount without waiting for a manual edit flag", async () => {
        const { renderMermaidSvg } = await import("./renderMermaidSvg");

        renderHook(() =>
            useDiagramMermaidAsset(
                "diagram-1",
                "flowchart TD\n  A --> B",
                null,
                null,
            ),
        );

        await waitFor(
            () => {
                expect(renderMermaidSvg).toHaveBeenCalled();
            },
            { timeout: 2000 },
        );
    });
});
