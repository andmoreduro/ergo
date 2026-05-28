import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
    useEffect,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import "@testing-library/jest-dom";

const compilerClientMock = vi.hoisted(() => ({
    syncSnapshot: vi.fn(),
    syncEvents: vi.fn(),
    compile: vi.fn(),
    renderPage: vi.fn(),
    renderSvgPage: vi.fn(),
    writeFile: vi.fn(),
    writeSource: vi.fn(),
    applyPatch: vi.fn(),
    jumpFromClick: vi.fn(),
    positionsForFocus: vi.fn(),
    exportPdf: vi.fn(),
    exportPngPages: vi.fn(),
}));

const dispatchActionMock = vi.hoisted(() => vi.fn());
const debugMock = vi.hoisted(() => ({
    enabled: false,
}));

vi.mock("../../../workers/compilerClient", () => ({
    CompilerClient: compilerClientMock,
}));

vi.mock("../../../actions/runtime", () => ({
    useActionDispatcher: () => dispatchActionMock,
}));

vi.mock("../../../config/debug", () => ({
    isDebugMenuEnabled: () => debugMock.enabled,
}));

import { Preview } from "./Preview";

const FocusElement = ({
    caretUtf16Offset = 0,
    elementId,
    fieldId = `${elementId}:text`,
}: {
    caretUtf16Offset?: number;
    elementId: string;
    fieldId?: string;
}) => {
    const { setDocumentFocus } = useDocument();
    useEffect(() => {
        setDocumentFocus({
            elementId,
            fieldId,
            caretUtf16Offset,
            sourceRevision: null,
            anchorPageNumber: null,
            forcePreviewScroll: false,
            focusSource: "native",
        });
    }, [caretUtf16Offset, elementId, fieldId, setDocumentFocus]);
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
            anchorPageNumber: null,
            forcePreviewScroll: false,
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
    latencyStartRef: { current: null },
    previewTelemetry: null,
    mainPreviewPaintedRevision: null,
    resourcePreviewRevisions: {},
    markMainPreviewPainted: vi.fn(),
});

const renderPreviewAndGetPage = async (
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
            <Preview
                compiler={compiler}
                zoom={1}
                zoomMode="manual"
                onZoomChange={() => undefined}
                onZoomModeChange={() => undefined}
                onExport={() => undefined}
            />
        </DocumentProvider>,
    );
    const pageContent = await waitFor(() => {
        const el = renderResult.container.querySelector<HTMLElement>(
            '[data-preview-page-content="svg"]',
        );
        if (!el || !el.dataset.pageWidthPt) {
            throw new Error("Preview page rendering pending");
        }
        return el;
    });
    return { ...renderResult, pageContent, canvas: pageContent };
};

const renderPreviewAndGetSvgPage = async (
    children: ReactNode = null,
    compiler = createDefaultCompilerState(),
) => {
    const result = await renderPreviewAndGetPage(children, compiler);
    return { ...result, svgPage: result.pageContent };
};

const renderPreviewAndGetCanvas = renderPreviewAndGetPage;

describe("Preview sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        debugMock.enabled = false;

        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );

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
        compilerClientMock.renderSvgPage.mockResolvedValue({
            pageIndex: 0,
            widthPt: 100,
            heightPt: 50,
            svg: '<svg viewBox="0 0 100 50"><text>Page</text></svg>',
            requestId: 1,
        });
    });

    afterEach(() => {
        delete (HTMLCanvasElement.prototype as Partial<{
            transferControlToOffscreen: HTMLCanvasElement["transferControlToOffscreen"];
        }>).transferControlToOffscreen;
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
        expect(callArgs[1]).toBeCloseTo(50, 1);
        expect(callArgs[2]).toBeCloseTo(25, 1);
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

    it("renders a synthetic caret when the backend returns a position without caretCue", async () => {
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
                    anchorPageNumber: null,
                    caretUtf16Offset: 0,
                    elementId: "heading-1",
                    fieldId: "heading-1:text",
                    sourceRevision: 4,
                },
                4,
            );
        });

        await waitFor(() => {
            expect(
                container.querySelector('[data-preview-sync-caret="true"]'),
            ).toBeInTheDocument();
        });
        expect(
            container.querySelector('[data-active-preview-page="true"]'),
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
            transform: "translate(-50%, -50%)",
        });
        expect(caret).toHaveClass(/syncCaret/);
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

    it("keeps the previous exact caret when the same displayed field returns no match", async () => {
        compilerClientMock.positionsForFocus
            .mockResolvedValueOnce({
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
                        xPt: 60,
                        yPt: 19,
                    },
                ],
                sourceRevision: 4,
                status: "matched",
            })
            .mockResolvedValueOnce({
                positions: [],
                sourceRevision: 4,
                status: "noMatch",
            });

        const compiler = createDefaultCompilerState();
        const { container, rerender } = await renderPreviewAndGetCanvas(
            <FocusElement caretUtf16Offset={1} elementId="heading-1" />,
            compiler,
        );

        await waitFor(() => {
            expect(container.querySelector('[data-preview-sync-caret="true"]'))
                .toHaveStyle({ left: "60%" });
        });

        rerender(
            <DocumentProvider>
                <FocusElement caretUtf16Offset={2} elementId="heading-1" />
                <div data-element-id="heading-1">
                    <button type="button">Delete</button>
                    <input aria-label="Heading editor" />
                </div>
                <Preview
                    compiler={compiler}
                    zoom={1}
                    zoomMode="manual"
                    onZoomChange={() => undefined}
                    onZoomModeChange={() => undefined}
                    onExport={() => undefined}
                />
            </DocumentProvider>,
        );

        await waitFor(() => {
            expect(compilerClientMock.positionsForFocus).toHaveBeenCalledTimes(2);
        });
        expect(container.querySelector('[data-preview-sync-caret="true"]'))
            .toHaveStyle({ left: "60%" });
    });

    it("clears a stale caret when focus identity changes and the new field has no match", async () => {
        compilerClientMock.positionsForFocus
            .mockResolvedValueOnce({
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
                        xPt: 60,
                        yPt: 19,
                    },
                ],
                sourceRevision: 4,
                status: "matched",
            })
            .mockResolvedValueOnce({
                positions: [],
                sourceRevision: 4,
                status: "noMatch",
            });

        const compiler = createDefaultCompilerState();
        const { container, rerender } = await renderPreviewAndGetCanvas(
            <FocusElement caretUtf16Offset={1} elementId="heading-1" />,
            compiler,
        );

        await waitFor(() => {
            expect(container.querySelector('[data-preview-sync-caret="true"]'))
                .toBeInTheDocument();
        });

        rerender(
            <DocumentProvider>
                <FocusElement caretUtf16Offset={1} elementId="heading-2" />
                <div data-element-id="heading-1">
                    <button type="button">Delete</button>
                    <input aria-label="Heading editor" />
                </div>
                <Preview
                    compiler={compiler}
                    zoom={1}
                    zoomMode="manual"
                    onZoomChange={() => undefined}
                    onZoomModeChange={() => undefined}
                    onExport={() => undefined}
                />
            </DocumentProvider>,
        );

        await waitFor(() => {
            expect(compilerClientMock.positionsForFocus).toHaveBeenCalledTimes(2);
        });
        expect(
            container.querySelector('[data-preview-sync-caret="true"]'),
        ).not.toBeInTheDocument();
    });

    it("coalesces native caret requests to the latest target in an animation frame", async () => {
        const frameCallbacks = new Map<number, FrameRequestCallback>();
        let frameId = 0;
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            frameId += 1;
            frameCallbacks.set(frameId, callback);
            return frameId;
        });
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
            frameCallbacks.delete(id);
        });

        const compiler = createDefaultCompilerState();
        const { rerender } = await renderPreviewAndGetCanvas(null, compiler);

        const renderWithCaret = (caretUtf16Offset: number) =>
            rerender(
                <DocumentProvider>
                    <FocusElement
                        caretUtf16Offset={caretUtf16Offset}
                        elementId="heading-1"
                    />
                    <div data-element-id="heading-1">
                        <button type="button">Delete</button>
                        <input aria-label="Heading editor" />
                    </div>
                        <Preview
                            compiler={compiler}
                            zoom={1}
                            zoomMode="manual"
                            onZoomChange={() => undefined}
                            onZoomModeChange={() => undefined}
                            onExport={() => undefined}
                        />
                </DocumentProvider>,
            );

        renderWithCaret(1);
        renderWithCaret(2);
        renderWithCaret(3);

        await waitFor(() => {
            expect(frameCallbacks.size).toBeGreaterThan(0);
        });

        const callbacks = [...frameCallbacks.values()];
        frameCallbacks.clear();
        act(() => {
            callbacks.forEach((callback) => callback(0));
        });

        await waitFor(() => {
            expect(compilerClientMock.positionsForFocus).toHaveBeenCalledTimes(1);
        });
        expect(compilerClientMock.positionsForFocus).toHaveBeenCalledWith(
            expect.objectContaining({ caretUtf16Offset: 3 }),
            4,
        );
    });

    it("does not render pages when previewRevision is null", async () => {
        render(
            <DocumentProvider>
                <Preview
                    compiler={{
                        ...createDefaultCompilerState(),
                        previewRevision: null,
                    }}
                    zoom={1}
                    zoomMode="manual"
                    onZoomChange={() => undefined}
                    onZoomModeChange={() => undefined}
                    onExport={() => undefined}
                />
            </DocumentProvider>,
        );

        await waitFor(() => {
            expect(compilerClientMock.renderPage).not.toHaveBeenCalled();
            expect(compilerClientMock.renderSvgPage).not.toHaveBeenCalled();
        });
    });

    it("renders main preview pages through SVG instead of the canvas raster path", async () => {
        const transferControlToOffscreen = vi.fn(() => ({} as OffscreenCanvas));
        Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
            configurable: true,
            value: transferControlToOffscreen,
        });

        const { container } = await renderPreviewAndGetCanvas();

        await waitFor(() => {
            expect(compilerClientMock.renderSvgPage).toHaveBeenCalledWith(0, 1);
        });
        expect(container.querySelector("canvas")).not.toBeInTheDocument();
        expect(compilerClientMock.renderPage).not.toHaveBeenCalled();
        expect(transferControlToOffscreen).not.toHaveBeenCalled();
    });

    it("sizes the page surface from Typst page metrics returned by render", async () => {
        compilerClientMock.renderSvgPage.mockResolvedValueOnce({
            pageIndex: 0,
            widthPt: 148,
            heightPt: 210,
            svg: '<svg viewBox="0 0 148 210"><text>Page</text></svg>',
            requestId: 1,
        });

        const { pageContent } = await renderPreviewAndGetCanvas();

        expect(pageContent.dataset.pageWidthPt).toBe("148");
        expect(pageContent.dataset.pageHeightPt).toBe("210");
    });

    it("renders SVG preview pages through innerHTML", async () => {
        const { svgPage } = await renderPreviewAndGetSvgPage();

        expect(compilerClientMock.renderSvgPage).toHaveBeenCalledWith(0, 1);
        expect(compilerClientMock.renderPage).not.toHaveBeenCalled();
        expect(svgPage.innerHTML).toBe(
            '<svg viewBox="0 0 100 50"><text>Page</text></svg>',
        );
    });

    it("opens a bounded zoom menu with fit modes and 10 percent zoom levels", async () => {
        const onZoomChange = vi.fn();
        const onZoomModeChange = vi.fn();

        render(
            <DocumentProvider>
                <Preview
                    compiler={createDefaultCompilerState()}
                    zoom={1}
                    zoomMode="manual"
                    onZoomChange={onZoomChange}
                    onZoomModeChange={onZoomModeChange}
                    onExport={() => undefined}
                />
            </DocumentProvider>,
        );

        fireEvent.click(
            await screen.findByRole("button", {
                name: "Preview zoom options",
            }),
        );

        const menu = screen.getByRole("menu", {
            name: "Preview zoom options",
        });
        expect(menu).toHaveStyle({ maxHeight: "280px" });
        expect(
            screen.getByRole("menuitem", { name: "Fit width" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("menuitem", { name: "Fit height" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "50%" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "300%" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("menuitem", { name: "150%" }));

        expect(onZoomModeChange).toHaveBeenCalledWith("manual");
        expect(onZoomChange).toHaveBeenCalledWith(1.5);
    });

    it("lets users enter a decimal zoom level by double-clicking the zoom indicator", async () => {
        const onZoomChange = vi.fn();
        const onZoomModeChange = vi.fn();

        render(
            <DocumentProvider>
                <Preview
                    compiler={createDefaultCompilerState()}
                    zoom={1}
                    zoomMode="manual"
                    onZoomChange={onZoomChange}
                    onZoomModeChange={onZoomModeChange}
                    onExport={() => undefined}
                />
            </DocumentProvider>,
        );

        fireEvent.doubleClick(
            await screen.findByRole("button", {
                name: "Preview zoom options",
            }),
        );
        const input = screen.getByRole("spinbutton", {
            name: "Custom zoom percentage",
        });
        fireEvent.change(input, { target: { value: "133.5" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onZoomModeChange).toHaveBeenCalledWith("manual");
        expect(onZoomChange).toHaveBeenCalledWith(1.335);
    });

    it("uses 10 percent deltas for the toolbar zoom buttons", async () => {
        const onZoomChange = vi.fn();
        const onZoomModeChange = vi.fn();

        render(
            <DocumentProvider>
                <Preview
                    compiler={createDefaultCompilerState()}
                    zoom={1}
                    zoomMode="manual"
                    onZoomChange={onZoomChange}
                    onZoomModeChange={onZoomModeChange}
                    onExport={() => undefined}
                />
            </DocumentProvider>,
        );

        fireEvent.click(
            await screen.findByRole("button", { name: /zoom in/i }),
        );

        expect(onZoomModeChange).toHaveBeenCalledWith("manual");
        const updater = onZoomChange.mock.calls[0][0] as (zoom: number) => number;
        expect(updater(1)).toBe(1.1);
    });

    it("replaces only changed SVG page content and keeps unchanged pages in place", async () => {
        compilerClientMock.renderSvgPage.mockImplementation(
            async (pageIndex: number, requestId: number) => ({
                pageIndex,
                widthPt: 100,
                heightPt: 50,
                svg: `<svg><text>revision 4 page ${pageIndex + 1}</text></svg>`,
                requestId,
            }),
        );

        const firstCompiler = {
            ...createDefaultCompilerState(),
            previewPages: [
                { page_number: 1, path: "page-1", changed: true, content: null },
                { page_number: 2, path: "page-2", changed: true, content: null },
            ],
        };
        let setCompiler!: Dispatch<SetStateAction<typeof firstCompiler>>;
        const Harness = () => {
            const [compiler, updateCompiler] = useState(firstCompiler);
            setCompiler = updateCompiler;
            return (
                <DocumentProvider>
                    <div data-element-id="heading-1">
                        <button type="button">Delete</button>
                        <input aria-label="Heading editor" />
                    </div>
                    <Preview
                        compiler={compiler}
                        zoom={1}
                        zoomMode="manual"
                        onZoomChange={() => undefined}
                        onZoomModeChange={() => undefined}
                        onExport={() => undefined}
                    />
                </DocumentProvider>
            );
        };
        const { container } = render(<Harness />);
        await waitFor(
            () => {
                const el = container.querySelector<HTMLElement>(
                    '[data-preview-page-content="svg"]',
                );
                if (!el || !el.dataset.pageWidthPt) {
                    throw new Error("Preview page rendering pending");
                }
            },
        );

        await waitFor(() => {
            expect(compilerClientMock.renderSvgPage).toHaveBeenCalledTimes(2);
        });

        const firstPage = container.querySelector<HTMLElement>(
            '[data-preview-page-number="1"] [data-preview-page-content="svg"]',
        );
        const secondPage = container.querySelector<HTMLElement>(
            '[data-preview-page-number="2"] [data-preview-page-content="svg"]',
        );
        expect(firstPage?.innerHTML).toContain("revision 4 page 1");
        expect(secondPage?.innerHTML).toContain("revision 4 page 2");
        await act(async () => {
            await Promise.resolve();
        });

        compilerClientMock.renderSvgPage.mockClear();
        compilerClientMock.renderSvgPage.mockImplementation(
            async (pageIndex: number, requestId: number) => ({
                pageIndex,
                widthPt: 100,
                heightPt: 50,
                svg: `<svg><text>revision 5 page ${pageIndex + 1}</text></svg>`,
                requestId,
            }),
        );

        act(() => {
            setCompiler({
                ...firstCompiler,
                previewRevision: 5,
                previewPages: [
                    { page_number: 1, path: "page-1", changed: false, content: null },
                    { page_number: 2, path: "page-2", changed: true, content: null },
                ],
            });
        });

        await waitFor(() => {
            expect(compilerClientMock.renderSvgPage).toHaveBeenCalledTimes(1);
        });
        expect(compilerClientMock.renderSvgPage).toHaveBeenCalledWith(
            1,
            expect.any(Number),
        );
        expect(firstPage?.innerHTML).toContain("revision 4 page 1");
        expect(secondPage?.innerHTML).toContain("revision 5 page 2");
    });

    it("maps project input field ids to backend input source map targets", async () => {
        await renderPreviewAndGetCanvas(<FocusProjectInput fieldId="project-input-/abstract_text" />);

        await waitFor(() => {
            expect(compilerClientMock.positionsForFocus).toHaveBeenCalledWith(
                {
                    anchorPageNumber: null,
                    caretUtf16Offset: 0,
                    elementId: "inputs",
                    fieldId: "/abstract_text",
                    sourceRevision: 4,
                },
                4,
            );
        });
    });

    it("hides end-to-end latency telemetry when debug UI is disabled", async () => {
        await renderPreviewAndGetCanvas(null, {
            ...createDefaultCompilerState(),
            previewTelemetry: {
                totalLatencyMs: 42,
                queuedToSyncMs: 3,
                workerSyncMs: 5,
                compileMs: 11,
                paintMs: 23,
            },
        });

        expect(document.body).not.toHaveTextContent("Latency: 42ms");
    });

    it("shows end-to-end latency and stage timings when debug UI is enabled", async () => {
        debugMock.enabled = true;

        await renderPreviewAndGetCanvas(null, {
            ...createDefaultCompilerState(),
            previewTelemetry: {
                totalLatencyMs: 42,
                queuedToSyncMs: 3,
                workerSyncMs: 5,
                compileMs: 11,
                paintMs: 23,
            },
        });

        expect(document.body).toHaveTextContent(
            "Latency: 42ms · Queue: 3ms · Sync: 5ms · Compile: 11ms · Paint: 23ms",
        );
    });
});
