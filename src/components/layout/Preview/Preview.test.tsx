import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import "@testing-library/jest-dom";

const useCompilerMock = vi.hoisted(() => vi.fn());
const tauriApiMock = vi.hoisted(() => ({
    getPreviewPositionsForElement: vi.fn(),
    jumpFromPreviewClick: vi.fn(),
}));

vi.mock("../../../hooks/useCompiler", () => ({
    useCompiler: useCompilerMock,
}));

vi.mock("../../../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

import { Preview } from "./Preview";

const svgPage =
    '<svg viewBox="0 0 100 50" width="100" height="50"><text x="10" y="20">Título</text></svg>';

const ActiveElementProbe = () => {
    const { activeElementId } = useDocument();
    return <span data-testid="active-element">{activeElementId}</span>;
};

const FocusElement = ({ elementId }: { elementId: string }) => {
    const { setActiveElementId } = useDocument();
    useEffect(() => {
        setActiveElementId(elementId);
    }, [elementId, setActiveElementId]);
    return null;
};

const renderPreview = (children: ReactNode = null) =>
    render(
        <DocumentProvider>
            {children}
            <div data-element-id="heading-1">
                <button type="button">Delete</button>
                <input aria-label="Heading editor" />
            </div>
            <Preview />
            <ActiveElementProbe />
        </DocumentProvider>,
    );

describe("Preview sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useCompilerMock.mockReturnValue({
            error: null,
            isCompiling: false,
            previewRevision: 4,
            sourceMap: [],
            svgs: [svgPage],
        });
        tauriApiMock.getPreviewPositionsForElement.mockResolvedValue({
            positions: [],
            sourceRevision: 4,
            status: "noMatch",
        });
    });

    it("converts SVG clicks to Typst preview coordinates and focuses the matched element", async () => {
        tauriApiMock.jumpFromPreviewClick.mockResolvedValue({
            elementId: "heading-1",
            sourceRevision: 4,
            status: "element",
        });

        const { container } = renderPreview();
        const svg = container.querySelector("svg") as SVGSVGElement;
        vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
            bottom: 70,
            height: 50,
            left: 20,
            right: 120,
            toJSON: () => ({}),
            top: 20,
            width: 100,
            x: 20,
            y: 20,
        } as DOMRect);

        fireEvent.click(svg, { clientX: 70, clientY: 45 });

        await waitFor(() => {
            expect(tauriApiMock.jumpFromPreviewClick).toHaveBeenCalledWith(
                1,
                50,
                25,
                4,
            );
        });
        await waitFor(() => {
            expect(screen.getByTestId("active-element")).toHaveTextContent(
                "heading-1",
            );
        });
        expect(screen.getByLabelText("Heading editor")).toHaveFocus();
    });

    it("requests preview positions for the focused element without changing layout", async () => {
        tauriApiMock.getPreviewPositionsForElement.mockResolvedValue({
            positions: [
                {
                    elementId: "heading-1",
                    pageNumber: 1,
                    sourceRevision: 4,
                    xPt: 25,
                    yPt: 10,
                },
            ],
            sourceRevision: 4,
            status: "matched",
        });

        const { container } = renderPreview(<FocusElement elementId="heading-1" />);

        await waitFor(() => {
            expect(tauriApiMock.getPreviewPositionsForElement).toHaveBeenCalledWith(
                "heading-1",
                4,
            );
        });

        expect(
            container.querySelector('[data-active-preview-page="true"]'),
        ).toBeInTheDocument();
    });
});
