import { fireEvent, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import "@testing-library/jest-dom";

const tauriApiMock = vi.hoisted(() => ({
    getPreviewPositionsForElement: vi.fn(),
    getPreviewPositionsForFocus: vi.fn(),
    jumpFromPreviewClick: vi.fn(),
}));
const dispatchActionMock = vi.hoisted(() => vi.fn());

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

const FocusProjectInput = ({ fieldId }: { fieldId: string }) => {
    const { setDocumentFocus } = useDocument();
    useEffect(() => {
        setDocumentFocus({
            elementId: "project",
            fieldId,
            caretUtf16Offset: 0,
            sourceRevision: 4,
            focusSource: "preview",
        });
    }, [fieldId, setDocumentFocus]);
    return null;
};

const createDefaultCompilerState = () => ({
    error: null,
    isCompiling: false,
    previewRevision: 4,
    sourceMap: [],
    svgs: [svgPage],
    outline: null,
    resources: null,
    latencyMs: null,
});

const createCompilerState = (
    overrides: Partial<ReturnType<typeof createDefaultCompilerState>> = {},
) => ({
    ...createDefaultCompilerState(),
    ...overrides,
});

const renderPreview = (
    children: ReactNode = null,
    compiler = createDefaultCompilerState(),
) =>
    render(
        <DocumentProvider>
            {children}
            <div data-element-id="heading-1">
                <button type="button">Delete</button>
                <input aria-label="Heading editor" />
            </div>
            <Preview compiler={compiler} />
        </DocumentProvider>,
    );

describe("Preview sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
                    caretCue: null,
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
        ).not.toBeInTheDocument();
        expect(
            container.querySelector('[data-preview-sync-marker="true"]'),
        ).not.toBeInTheDocument();
    });

    it("renders a persistent caret cue when the backend returns click-equivalent caret geometry", async () => {
        tauriApiMock.getPreviewPositionsForFocus.mockResolvedValue({
            positions: [
                {
                    caretCue: {
                        heightPt: 10,
                        topYPt: 14,
                    },
                    caretUtf16Offset: 5,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    pageNumber: 1,
                    sourceRevision: 4,
                    xPt: 42,
                    yPt: 19,
                },
            ],
            sourceRevision: 4,
            status: "matched",
        });

        const { container } = renderPreview(<FocusElement elementId="heading-1" />);

        await waitFor(() => {
            expect(container.querySelector('[data-preview-sync-caret="true"]'))
                .toBeInTheDocument();
        });

        const caret = container.querySelector<HTMLElement>(
            '[data-preview-sync-caret="true"]',
        );
        expect(caret).toHaveStyle({
            height: "20%",
            left: "42%",
            top: "28%",
        });
        expect(
            container.querySelector('[data-preview-sync-marker="true"]'),
        ).not.toBeInTheDocument();
    });

    it("shows the caret for the latest preview click and ignores stale click cue responses", async () => {
        let resolveFirstPosition:
            | ((value: Awaited<ReturnType<typeof tauriApiMock.getPreviewPositionsForFocus>>) => void)
            | null = null;
        let resolveSecondPosition:
            | ((value: Awaited<ReturnType<typeof tauriApiMock.getPreviewPositionsForFocus>>) => void)
            | null = null;
        tauriApiMock.jumpFromPreviewClick
            .mockResolvedValueOnce({
                target: {
                    caretUtf16Offset: 1,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    sourceRevision: 4,
                },
                sourceRevision: 4,
                status: "field",
            })
            .mockResolvedValueOnce({
                target: {
                    caretUtf16Offset: 2,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    sourceRevision: 4,
                },
                sourceRevision: 4,
                status: "field",
            });
        tauriApiMock.getPreviewPositionsForFocus
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveFirstPosition = resolve;
                    }),
            )
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveSecondPosition = resolve;
                    }),
            );

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

        fireEvent.click(svg, { clientX: 30, clientY: 30 });
        fireEvent.click(svg, { clientX: 80, clientY: 30 });

        await waitFor(() => {
            expect(tauriApiMock.getPreviewPositionsForFocus).toHaveBeenCalledTimes(2);
        });

        resolveSecondPosition?.({
            positions: [
                {
                    caretCue: {
                        heightPt: 10,
                        topYPt: 14,
                    },
                    caretUtf16Offset: 2,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    pageNumber: 1,
                    sourceRevision: 4,
                    xPt: 60,
                    yPt: 19,
                },
            ],
            sourceRevision: 4,
            status: "matched",
        });

        await waitFor(() => {
            expect(container.querySelector('[data-preview-sync-caret="true"]'))
                .toHaveStyle({ left: "60%" });
        });

        resolveFirstPosition?.({
            positions: [
                {
                    caretCue: {
                        heightPt: 10,
                        topYPt: 14,
                    },
                    caretUtf16Offset: 1,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    pageNumber: 1,
                    sourceRevision: 4,
                    xPt: 20,
                    yPt: 19,
                },
            ],
            sourceRevision: 4,
            status: "matched",
        });

        await waitFor(() => {
            expect(container.querySelector('[data-preview-sync-caret="true"]'))
                .toHaveStyle({ left: "60%" });
        });
    });

    it("maps project input field ids to backend input source map targets", async () => {
        renderPreview(<FocusProjectInput fieldId="project-input-/abstract_text" />);

        await waitFor(() => {
            expect(tauriApiMock.getPreviewPositionsForFocus).toHaveBeenCalledWith(
                {
                    caretUtf16Offset: 0,
                    elementId: "inputs",
                    fieldId: "/abstract_text",
                    sourceRevision: 4,
                },
                4,
            );
        });
    });
});
