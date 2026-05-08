import { fireEvent, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import "@testing-library/jest-dom";

const useCompilerMock = vi.hoisted(() => vi.fn());
const tauriApiMock = vi.hoisted(() => ({
    getPreviewPositionsForElement: vi.fn(),
    getPreviewPositionsForFocus: vi.fn(),
    jumpFromPreviewClick: vi.fn(),
}));
const dispatchActionMock = vi.hoisted(() => vi.fn());

vi.mock("../../../hooks/useCompiler", () => ({
    useCompiler: useCompilerMock,
}));

vi.mock("../../../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

vi.mock("../../../actions/runtime", () => ({
    useActionDispatcher: () => dispatchActionMock,
}));

import { Preview } from "./Preview";

const svgPage =
    '<svg viewBox="0 0 100 50" width="100" height="50"><text x="10" y="20">Título</text></svg>';

const FocusElement = ({ elementId }: { elementId: string }) => {
    const { setDocumentFocus } = useDocument();
    useEffect(() => {
        setDocumentFocus({
            elementId,
            fieldId: "heading-1:text",
            caretUtf16Offset: 0,
            sourceRevision: null,
            focusSource: "native",
        });
    }, [elementId, setDocumentFocus]);
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
        tauriApiMock.getPreviewPositionsForFocus.mockResolvedValue({
            positions: [],
            sourceRevision: 4,
            status: "noMatch",
        });
    });

    it("converts SVG clicks to Typst preview coordinates and dispatches field focus", async () => {
        tauriApiMock.jumpFromPreviewClick.mockResolvedValue({
            target: {
                caretUtf16Offset: 0,
                elementId: "heading-1",
                fieldId: "heading-1:text",
                sourceRevision: 4,
            },
            sourceRevision: 4,
            status: "field",
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
            expect(dispatchActionMock).toHaveBeenCalledWith({
                id: "editor::FocusField",
                payload: {
                    caretUtf16Offset: 0,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    sourceRevision: 4,
                },
            });
        });
    });

    it("requests preview positions for the focused element without changing layout", async () => {
        tauriApiMock.getPreviewPositionsForFocus.mockResolvedValue({
            positions: [
                {
                    caretUtf16Offset: 0,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
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
            expect(tauriApiMock.getPreviewPositionsForFocus).toHaveBeenCalledWith(
                {
                    caretUtf16Offset: 0,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    sourceRevision: 4,
                },
                4,
            );
        });

        expect(
            container.querySelector('[data-active-preview-page="true"]'),
        ).toBeInTheDocument();
    });
});
