import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentAST } from "../../../bindings/DocumentAST";
import { DocumentProvider, useDocument } from "../../../state/DocumentContext";
import {
    createDefaultDocumentAST,
    createEquation,
    createHeading,
    createTable,
} from "../../../state/ast/defaults";
import { Sidebar } from "./Sidebar";

import "@testing-library/jest-dom";

const dispatchActionMock = vi.hoisted(() => vi.fn());
const compilerClientMock = vi.hoisted(() => ({
    renderResourcePage: vi.fn().mockResolvedValue({
        pageIndex: 1,
        width: 120,
        height: 120,
        pixels: new Uint8Array(120 * 120 * 4),
        requestId: 1,
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../actions/runtime", () => ({
    useActionDispatcher: () => dispatchActionMock,
}));

vi.mock("../../../workers/compilerClient", () => ({
    CompilerClient: compilerClientMock,
}));

const LoadDocument = ({ ast }: { ast: DocumentAST }) => {
    const { dispatch } = useDocument();

    useEffect(() => {
        dispatch({ type: "LOAD_DOCUMENT", payload: { ast } });
    }, [ast, dispatch]);

    return null;
};

const createDocumentWithHeadings = () => {
    const ast = createDefaultDocumentAST();
    const [section] = ast.sections;
    if (section.type !== "Content") {
        return ast;
    }

    return {
        ...ast,
        inputs: {
            ...ast.inputs,
            abstract_text: "Resumen",
        },
        sections: [
            {
                ...section,
                elements: [
                    createHeading(1, "Introduction", "heading-1"),
                    createHeading(2, "Methods", "heading-2"),
                ],
            },
        ],
    };
};

describe("Sidebar outline", () => {
    beforeEach(() => {
        dispatchActionMock.mockClear();
        compilerClientMock.renderResourcePage.mockClear();

        vi.stubGlobal(
            "ResizeObserver",
            class {
                observe() {}
                disconnect() {}
            },
        );

        vi.stubGlobal("devicePixelRatio", 1);
        Object.defineProperty(HTMLElement.prototype, "clientWidth", {
            configurable: true,
            value: 160,
        });
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            putImageData: () => {},
        } as unknown as CanvasRenderingContext2D);

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
    });

    afterEach(() => {
        delete (HTMLCanvasElement.prototype as Partial<{
            transferControlToOffscreen: HTMLCanvasElement["transferControlToOffscreen"];
        }>).transferControlToOffscreen;
    });

    it("renders compiled outline entries with page numbers", () => {
        render(
            <DocumentProvider>
                <LoadDocument ast={createDocumentWithHeadings()} />
                <Sidebar
                    outline={{
                        entries: [
                            { level: 1, text: "Abstract", page: 1 },
                            { level: 1, text: "Introduction", page: 2 },
                            { level: 2, text: "Methods", page: 3 },
                        ],
                    }}
                    previewRevision={9}
                />
            </DocumentProvider>,
        );

        expect(screen.getByText("Outline")).toBeInTheDocument();
        expect(screen.queryByText("Document Structure")).not.toBeInTheDocument();
        expect(screen.getByText("Abstract")).toBeInTheDocument();
        expect(screen.getByText("Page 1")).toBeInTheDocument();
        expect(screen.getByText("Introduction")).toBeInTheDocument();
        expect(screen.getByText("Page 2")).toBeInTheDocument();
        expect(screen.getByText("Methods")).toBeInTheDocument();
        expect(screen.getByText("Page 3")).toBeInTheDocument();
    });

    it("keeps compiled outline entries that do not map to a second editor heading", () => {
        render(
            <DocumentProvider>
                <LoadDocument ast={createDocumentWithHeadings()} />
                <Sidebar
                    outline={{
                        entries: [
                            { level: 1, text: "Introduction", page: 2 },
                            { level: 2, text: "Methods", page: 2 },
                            { level: 1, text: "Introduction", page: 4 },
                            { level: 2, text: "Methods", page: 4 },
                        ],
                    }}
                    previewRevision={9}
                />
            </DocumentProvider>,
        );

        expect(screen.getAllByText("Introduction")).toHaveLength(2);
        expect(screen.getAllByText("Methods")).toHaveLength(2);
        expect(screen.getAllByText("Page 4")).toHaveLength(2);
    });

    it("focuses the editor field for a clicked outline heading", async () => {
        render(
            <DocumentProvider>
                <LoadDocument ast={createDocumentWithHeadings()} />
                <Sidebar
                    outline={{
                        entries: [{ level: 2, text: "Methods", page: 3 }],
                    }}
                    previewRevision={9}
                />
            </DocumentProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: /Methods\s*Page 3/ }));

        await waitFor(() => {
            expect(dispatchActionMock).toHaveBeenCalledWith({
                id: "editor::FocusField",
                payload: {
                    elementId: "heading-2",
                    fieldId: "heading-2:text",
                    caretUtf16Offset: 0,
                    anchorPageNumber: 3,
                    forcePreviewScroll: true,
                    sourceRevision: 9,
                },
            });
        });
    });

    it("focuses the abstract input for the abstract outline entry", async () => {
        render(
            <DocumentProvider>
                <LoadDocument ast={createDocumentWithHeadings()} />
                <Sidebar
                    outline={{
                        entries: [{ level: 1, text: "Abstract", page: 1 }],
                    }}
                    previewRevision={9}
                />
            </DocumentProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: /Abstract\s*Page 1/ }));

        await waitFor(() => {
            expect(dispatchActionMock).toHaveBeenCalledWith({
                id: "editor::FocusField",
                payload: {
                    elementId: "project",
                    fieldId: "project-input-/abstract_text",
                    caretUtf16Offset: 0,
                    anchorPageNumber: 1,
                    forcePreviewScroll: true,
                    sourceRevision: 9,
                },
            });
        });
    });

    it("renders bibliography entries and opens editing through bibliography actions", async () => {
        render(
            <DocumentProvider>
                <Sidebar />
            </DocumentProvider>,
        );

        fireEvent.click(screen.getByRole("button", { name: "Add Bibliography Entry" }));
        expect(dispatchActionMock).toHaveBeenLastCalledWith({
            id: "bibliography::CreateEntry",
            payload: null,
        });
        const createDialog = screen.getByRole("dialog", {
            name: "Add Bibliography Entry",
        });
        expect(createDialog).toBeInTheDocument();
        const createForm = within(createDialog);
        fireEvent.change(createForm.getByRole("textbox", { name: /^Title/ }), {
            target: { value: "Niñez y escritura" },
        });
        fireEvent.change(createForm.getByRole("textbox", { name: /^Authors/ }), {
            target: { value: "Ana García\nLuis Pérez" },
        });
        fireEvent.change(createForm.getByRole("textbox", { name: /^Year/ }), {
            target: { value: "2024" },
        });
        fireEvent.change(createForm.getByRole("textbox", { name: /^Journal/ }), {
            target: { value: "Revista de Pruebas" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save Bibliography Entry" }));
        expect(dispatchActionMock).toHaveBeenLastCalledWith({
            id: "bibliography::SaveEntry",
            payload: expect.objectContaining({ mode: "create" }),
        });

        expect(
            await screen.findByRole("button", {
                name: /García; Pérez \(2024\)\. Niñez y escritura\. Revista de Pruebas\./,
            }),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: /García; Pérez \(2024\)\. Niñez y escritura\. Revista de Pruebas\./,
            }),
        );
        expect(dispatchActionMock).toHaveBeenLastCalledWith({
            id: "bibliography::OpenEntry",
            payload: { referenceId: expect.any(String) },
        });
        const editDialog = screen.getByRole("dialog", {
            name: "Edit Bibliography Entry",
        });
        expect(editDialog).toBeInTheDocument();
        fireEvent.change(within(editDialog).getByRole("textbox", { name: /^Year/ }), {
            target: { value: "2025" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Save Bibliography Entry" }));

        expect(
            await screen.findByRole("button", {
                name: /García; Pérez \(2025\)\. Niñez y escritura\. Revista de Pruebas\./,
            }),
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", {
                name: /García; Pérez \(2025\)\. Niñez y escritura\. Revista de Pruebas\./,
            }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Remove Bibliography Entry" }));
        expect(dispatchActionMock).toHaveBeenLastCalledWith({
            id: "bibliography::RemoveEntry",
            payload: { referenceId: expect.any(String) },
        });

        expect(screen.getByText("No bibliography entries available")).toBeInTheDocument();
    });

    it("renders resources grouped by type and dispatches resource actions", async () => {
        const ast = createDefaultDocumentAST();
        const [section] = ast.sections;
        if (section.type === "Content") {
            section.elements = [
                createEquation("equation-1", "E = mc^2"),
                createTable(2, 2, "table-1"),
            ];
        }

        render(
            <DocumentProvider>
                <LoadDocument ast={ast} />
                <Sidebar
                    previewRevision={1}
                    resources={{
                        groups: [
                            {
                                kind: "equation",
                                label: "Equations",
                                entries: [
                                    {
                                        id: "equation-1",
                                        kind: "equation",
                                        label: "Equation",
                                        subtitle: "E = mc^2",
                                        reference_token: "@ergo-equation-1",
                                        source_element_id: "equation-1",
                                        asset_id: null,
                                        preview: {
                                            status: "ready",
                                            path: null,
                                            page_number: 1,
                                            content: null,
                                            diagnostic: null,
                                        },
                                    },
                                ],
                            },
                            {
                                kind: "table",
                                label: "Tables",
                                entries: [
                                    {
                                        id: "table-1",
                                        kind: "table",
                                        label: "Table",
                                        subtitle: "2 x 2",
                                        reference_token: "@ergo-table-1",
                                        source_element_id: "table-1",
                                        asset_id: null,
                                        preview: {
                                            status: "failed",
                                            path: null,
                                            page_number: null,
                                            content: null,
                                            diagnostic: "preview failed",
                                        },
                                    },
                                ],
                            },
                        ],
                    }}
                />
            </DocumentProvider>,
        );

        expect(screen.getByText("Equations")).toBeInTheDocument();
        expect(screen.getByText("Tables")).toBeInTheDocument();
        expect(screen.getByText("preview failed")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Equation\s*E = mc\^2/ }));
        expect(dispatchActionMock).toHaveBeenCalledWith({
            id: "resources::Open",
            payload: { resourceId: "equation-1" },
        });
    });

    it("does not rerender resource thumbnails for unrelated preview revisions", async () => {
        const resources = {
            groups: [
                {
                    kind: "equation",
                    label: "Equations",
                    entries: [
                        {
                            id: "equation-1",
                            kind: "equation",
                            label: "Equation",
                            subtitle: "E = mc^2",
                            reference_token: "@ergo-equation-1",
                            source_element_id: "equation-1",
                            asset_id: null,
                            preview: {
                                status: "ready" as const,
                                path: null,
                                page_number: 1,
                                content: null,
                                diagnostic: null,
                            },
                        },
                    ],
                },
            ],
        };

        const { rerender } = render(
            <DocumentProvider>
                <Sidebar
                    previewRevision={4}
                    mainPreviewPaintedRevision={4}
                    resourcePreviewRevisions={{ "equation-1": 4 }}
                    resources={resources}
                    previewZoomRenderDebounceMs={0}
                />
            </DocumentProvider>,
        );

        await waitFor(() =>
            expect(compilerClientMock.renderResourcePage).toHaveBeenCalledTimes(1),
        );

        rerender(
            <DocumentProvider>
                <Sidebar
                    previewRevision={5}
                    mainPreviewPaintedRevision={5}
                    resourcePreviewRevisions={{ "equation-1": 4 }}
                    resources={resources}
                    previewZoomRenderDebounceMs={0}
                />
            </DocumentProvider>,
        );

        await waitFor(() =>
            expect(compilerClientMock.renderResourcePage).toHaveBeenCalledTimes(1),
        );
    });

    it("waits for the main preview paint before rendering a dirty resource thumbnail", async () => {
        const resources = {
            groups: [
                {
                    kind: "equation",
                    label: "Equations",
                    entries: [
                        {
                            id: "equation-1",
                            kind: "equation",
                            label: "Equation",
                            subtitle: "E = mc^2",
                            reference_token: "@ergo-equation-1",
                            source_element_id: "equation-1",
                            asset_id: null,
                            preview: {
                                status: "ready" as const,
                                path: null,
                                page_number: 1,
                                content: null,
                                diagnostic: null,
                            },
                        },
                    ],
                },
            ],
        };

        const { rerender } = render(
            <DocumentProvider>
                <Sidebar
                    previewRevision={8}
                    mainPreviewPaintedRevision={7}
                    resourcePreviewRevisions={{ "equation-1": 8 }}
                    resources={resources}
                    previewZoomRenderDebounceMs={0}
                />
            </DocumentProvider>,
        );

        await waitFor(() =>
            expect(compilerClientMock.renderResourcePage).not.toHaveBeenCalled(),
        );

        rerender(
            <DocumentProvider>
                <Sidebar
                    previewRevision={8}
                    mainPreviewPaintedRevision={8}
                    resourcePreviewRevisions={{ "equation-1": 8 }}
                    resources={resources}
                    previewZoomRenderDebounceMs={0}
                />
            </DocumentProvider>,
        );

        await waitFor(() =>
            expect(compilerClientMock.renderResourcePage).toHaveBeenCalledTimes(1),
        );
    });

    it("renders resource thumbnails from worker pixels even when canvas transfer is available", async () => {
        const transferControlToOffscreen = vi.fn(() => ({} as OffscreenCanvas));
        Object.defineProperty(HTMLCanvasElement.prototype, "transferControlToOffscreen", {
            configurable: true,
            value: transferControlToOffscreen,
        });
        const resources = {
            groups: [
                {
                    kind: "equation",
                    label: "Equations",
                    entries: [
                        {
                            id: "equation-1",
                            kind: "equation",
                            label: "Equation",
                            subtitle: "E = mc^2",
                            reference_token: "@ergo-equation-1",
                            source_element_id: "equation-1",
                            asset_id: null,
                            preview: {
                                status: "ready" as const,
                                path: null,
                                page_number: 1,
                                content: null,
                                diagnostic: null,
                            },
                        },
                    ],
                },
            ],
        };

        render(
            <DocumentProvider>
                <Sidebar
                    previewRevision={4}
                    mainPreviewPaintedRevision={4}
                    resourcePreviewRevisions={{ "equation-1": 4 }}
                    resources={resources}
                    previewZoomRenderDebounceMs={0}
                />
            </DocumentProvider>,
        );

        await waitFor(() => {
            expect(compilerClientMock.renderResourcePage).toHaveBeenCalledWith(
                1,
                expect.any(Number),
                1,
            );
        });
        expect(transferControlToOffscreen).not.toHaveBeenCalled();
    });
});
