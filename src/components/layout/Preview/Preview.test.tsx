import { fireEvent, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import "@testing-library/jest-dom";

const compilerClientMock = vi.hoisted(() => ({
    syncSnapshot: vi.fn(),
    syncEvents: vi.fn(),
    compile: vi.fn(),
    renderPage: vi.fn(),
    writeFile: vi.fn(),
    writeSource: vi.fn(),
    applyPatch: vi.fn(),
    jumpFromClick: vi.fn(),
    positionsForFocus: vi.fn(),
    exportPdf: vi.fn(),
    exportPng: vi.fn(),
}));

const dispatchActionMock = vi.hoisted(() => vi.fn());

vi.mock("../../../workers/compilerClient", () => ({
    CompilerClient: compilerClientMock,
}));

vi.mock("../../../actions/runtime", () => ({
    useActionDispatcher: () => dispatchActionMock,
}));

import { Preview } from "./Preview";

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
    previewPages: [{ page_number: 1, path: "page-1", changed: true, content: null }],
    outline: null,
    resources: null,
    latencyMs: null,
});

const renderPreviewAndGetCanvas = async (
    children: ReactNode = null,
    compiler = createDefaultCompilerState(),
) => {
    const renderResult = render(
        <DocumentProvider>
            {children}
            <div data-element-id="heading-1">
                <button type="button">Delete</button>
                <input aria-label="Heading editor" />
            </div>
            <Preview compiler={compiler} />
        </DocumentProvider>,
    );
    const canvas = await waitFor(() => {
        const el = renderResult.container.querySelector("canvas");
        if (!el || el.width !== 100) throw new Error("Canvas rendering pending");
        return el;
    });
    return { ...renderResult, canvas };
};

describe("Preview sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Stub devicePixelRatio to force pixelPerPt to be exactly 1.0 (1.3333 * 0.75... = 1.0)
        vi.stubGlobal("devicePixelRatio", 0.7500187504687617);

        // Stub getContext on HTMLCanvasElement prototype for JSDOM
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            putImageData: () => {},
        } as unknown as CanvasRenderingContext2D);

        // Stub ImageData in global scope if not present in JSDOM
        if (typeof global.ImageData === "undefined") {
            (global as any).ImageData = class ImageData {
                width: number;
                height: number;
                data: Uint8ClampedArray;
                constructor(data: Uint8ClampedArray, width: number, height: number) {
                    this.data = data;
                    this.width = width;
                    this.height = height;
                }
            };
        }

        compilerClientMock.positionsForFocus.mockResolvedValue({
            positions: [],
            sourceRevision: 4,
            status: "noMatch",
        });
        compilerClientMock.renderPage.mockResolvedValue({
            pageIndex: 0,
            width: 100,
            height: 50,
            pixels: new Uint8Array(100 * 50 * 4),
            requestId: 1,
        });
    });

    it("converts Canvas clicks to Typst preview coordinates and dispatches field focus", async () => {
        compilerClientMock.jumpFromClick.mockResolvedValue({
            target: {
                caretUtf16Offset: 0,
                elementId: "heading-1",
                fieldId: "heading-1:text",
                sourceRevision: 4,
            },
            sourceRevision: 4,
            status: "field",
        });

        const { canvas } = await renderPreviewAndGetCanvas();

        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
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

        fireEvent.click(canvas, { clientX: 70, clientY: 45 });

        await waitFor(() => {
            expect(compilerClientMock.jumpFromClick).toHaveBeenCalled();
        });
        const callArgs = compilerClientMock.jumpFromClick.mock.calls[0];
        expect(callArgs[0]).toBe(1);
        expect(callArgs[1]).toBeCloseTo(50, 5);
        expect(callArgs[2]).toBeCloseTo(25, 5);
        expect(callArgs[3]).toBe(4);
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
        compilerClientMock.positionsForFocus.mockResolvedValue({
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

        const { container } = await renderPreviewAndGetCanvas(<FocusElement elementId="heading-1" />);

        await waitFor(() => {
            expect(compilerClientMock.positionsForFocus).toHaveBeenCalledWith(
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
        compilerClientMock.positionsForFocus.mockResolvedValue({
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

        const { container } = await renderPreviewAndGetCanvas(<FocusElement elementId="heading-1" />);

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
            | ((value: Awaited<ReturnType<typeof compilerClientMock.positionsForFocus>>) => void)
            | null = null;
        let resolveSecondPosition:
            | ((value: Awaited<ReturnType<typeof compilerClientMock.positionsForFocus>>) => void)
            | null = null;
        compilerClientMock.jumpFromClick
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
        compilerClientMock.positionsForFocus
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

        const { container, canvas } = await renderPreviewAndGetCanvas();

        vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
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

        fireEvent.click(canvas, { clientX: 30, clientY: 30 });
        fireEvent.click(canvas, { clientX: 80, clientY: 30 });

        await waitFor(() => {
            expect(compilerClientMock.positionsForFocus).toHaveBeenCalledTimes(2);
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
        await renderPreviewAndGetCanvas(<FocusProjectInput fieldId="project-input-/abstract_text" />);

        await waitFor(() => {
            expect(compilerClientMock.positionsForFocus).toHaveBeenCalledWith(
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
