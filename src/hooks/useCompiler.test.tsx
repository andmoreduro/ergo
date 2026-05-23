import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentAST } from "../bindings/DocumentAST";
import { createDefaultDocumentAST } from "../state/ast/defaults";

const tauriApiMock = vi.hoisted(() => ({
    startPreviewWatch: vi.fn(),
    stopPreviewWatch: vi.fn(),
    listenToCompileEvents: vi.fn(),
    listenToResourcesEvents: vi.fn(() => Promise.resolve(() => undefined)),
    patchSource: vi.fn(),
    readPreviewSvg: vi.fn(),
    syncDocumentEvent: vi.fn(),
    syncDocumentEvents: vi.fn(),
    syncDocumentSnapshot: vi.fn(),
    writeSource: vi.fn(),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

import { useCompiler } from "./useCompiler";
import type { QueuedDocumentEvent } from "../state/DocumentContext";

const createDocumentWithTitle = (title: string): DocumentAST => {
    const ast = createDefaultDocumentAST();
    return {
        ...ast,
        metadata: {
            ...ast.metadata,
            title,
        },
    };
};

const createStatus = (sourceRevision: number) => ({
    dirtyElementIds: [],
    dirtySectionIds: [],
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
    sourceRevision,
});

const queuedEvent = (
    id: number,
    event: QueuedDocumentEvent["event"],
): QueuedDocumentEvent => ({
    id,
    event,
    timestamp: id,
});

const CompilerHarness = ({
    ast,
    events = [],
    sessionId = 1,
}: {
    ast: DocumentAST;
    events?: QueuedDocumentEvent[];
    sessionId?: number;
}) => {
    useCompiler(ast, events, sessionId, undefined, events.length);
    return null;
};

const withDocumentStatusRetry = <T,>(
    fn: (release: () => void) => T,
): [T, () => void] => {
    let release: (() => void) | null = null;
    const value = fn(() => {
        release?.();
    });
    return [value, () => {
        release = null;
    }];
};

describe("useCompiler source syncing", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("drains document events in order without sending snapshots for edits", async () => {
        const ast = createDocumentWithTitle("Me hago entender");
        let releaseFirstEvent: (() => void) | null = null;
        const syncedTitles: string[] = [];

        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvents.mockImplementation(
            async (events: QueuedDocumentEvent["event"][]) => {
                for (const event of events) {
                    syncedTitles.push(
                        event.type === "setProjectTitle" ? event.title : "",
                    );
                }
                if (syncedTitles.length === 1) {
                    await new Promise<void>((resolve) => {
                        releaseFirstEvent = resolve;
                    });
                }

                return createStatus(syncedTitles.length + 1);
            },
        );

        const { rerender, unmount } = render(
            <CompilerHarness
                ast={ast}
                events={[
                    queuedEvent(1, {
                        type: "setProjectTitle",
                        title: "Me hago entenderd",
                    }),
                ]}
            />,
        );

        await waitFor(() => {
            expect(releaseFirstEvent).not.toBeNull();
        });

        rerender(
            <CompilerHarness
                ast={ast}
                events={[
                    queuedEvent(1, {
                        type: "setProjectTitle",
                        title: "Me hago entenderd",
                    }),
                    queuedEvent(2, {
                        type: "setProjectTitle",
                        title: "Me hago entender",
                    }),
                ]}
            />,
        );
        releaseFirstEvent?.();

        await waitFor(() => {
            expect(syncedTitles[syncedTitles.length - 1]).toBe("Me hago entender");
        });
        expect(tauriApiMock.writeSource).not.toHaveBeenCalled();
        expect(tauriApiMock.patchSource).not.toHaveBeenCalled();
        expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalledTimes(1);
        expect(tauriApiMock.syncDocumentEvents).toHaveBeenCalled();
        expect(tauriApiMock.startPreviewWatch).toHaveBeenCalledTimes(2);

        unmount();
    });

    it("loads preview SVGs from backend preview files", async () => {
        const ast = createDocumentWithTitle("Vista previa");
        let capturedListeners: any = {};

        tauriApiMock.listenToCompileEvents.mockImplementation((listeners) => {
            capturedListeners = listeners;
            return Promise.resolve(() => undefined);
        });
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);
        fetchMock.mockResolvedValue({
            ok: true,
            text: async () => "<svg />",
        });

        const { unmount } = render(<CompilerHarness ast={ast} />);

        await waitFor(() => {
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled();
        });

        act(() => {
            capturedListeners.onSucceeded?.({
                source_revision: 1,
                status: "succeeded",
                preview_pages: [
                    {
                        changed: true,
                        page_number: 1,
                        path: ".ergproj/preview/svg/page-1.svg",
                        content: null,
                    },
                ],
                export_path: ".ergproj/preview/svg",
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
                expect.stringMatching(/^(http:\/\/ergo-preview\.localhost|ergo-preview:\/\/localhost)\/\.ergproj\/preview\/svg\/page-1\.svg\?rev=1$/)
            );
        });

        unmount();
    });

    it("reuses unchanged preview SVG pages after incremental preview updates", async () => {
        const ast = createDocumentWithTitle("Vista previa");
        const updatedAst = createDocumentWithTitle("Vista previa actualizada");
        let capturedListeners: any = {};

        tauriApiMock.listenToCompileEvents.mockImplementation((listeners) => {
            capturedListeners = listeners;
            return Promise.resolve(() => undefined);
        });
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvents.mockResolvedValue(createStatus(2));
        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);
        fetchMock
            .mockResolvedValueOnce({ ok: true, text: async () => "<svg>one</svg>" })
            .mockResolvedValueOnce({ ok: true, text: async () => "<svg>two</svg>" })
            .mockResolvedValueOnce({ ok: true, text: async () => "<svg>three</svg>" });

        const { rerender, unmount } = render(<CompilerHarness ast={ast} />);

        await waitFor(() => {
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled();
        });

        act(() => {
            capturedListeners.onSucceeded?.({
                source_revision: 1,
                status: "succeeded",
                preview_pages: [
                    { changed: true, page_number: 1, path: ".ergproj/preview/svg/page-1.svg", content: null },
                    { changed: true, page_number: 2, path: ".ergproj/preview/svg/page-2.svg", content: null },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        rerender(
            <CompilerHarness
                ast={updatedAst}
                events={[
                    queuedEvent(1, {
                        type: "setProjectTitle",
                        title: "Vista previa actualizada",
                    }),
                ]}
            />,
        );

        act(() => {
            capturedListeners.onSucceeded?.({
                source_revision: 2,
                status: "succeeded",
                preview_pages: [
                    { changed: false, page_number: 1, path: ".ergproj/preview/svg/page-1.svg", content: null },
                    { changed: true, page_number: 2, path: ".ergproj/preview/svg/page-2.svg", content: null },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });
        expect(
            fetchMock.mock.calls.filter(
                ([url]) => url.includes("/.ergproj/preview/svg/page-1.svg"),
            ),
        ).toHaveLength(1);

        unmount();
    });

    it("surfaces event sync failures without snapshot resync", async () => {
        const ast = createDocumentWithTitle("Base");
        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvents.mockRejectedValue(
            new Error("stale document event"),
        );
        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);

        const { unmount } = render(
            <CompilerHarness
                ast={ast}
                events={[
                    queuedEvent(1, {
                        type: "setProjectTitle",
                        title: "Will fail",
                    }),
                    queuedEvent(2, {
                        type: "setProjectTitle",
                        title: "Must not continue",
                    }),
                ]}
            />,
        );

        await waitFor(() => {
            expect(tauriApiMock.syncDocumentEvents).toHaveBeenCalledTimes(1);
        });
        expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalledTimes(1);
        expect(tauriApiMock.syncDocumentEvents).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: "Must not continue" }),
        );

        unmount();
    });

    it("renders intermediate revisions sequentially and preserves isCompiling until the latest compile finishes", async () => {
        const ast = createDocumentWithTitle("Test");
        let capturedListeners: any = {};

        tauriApiMock.listenToCompileEvents.mockImplementation((listeners) => {
            capturedListeners = listeners;
            return Promise.resolve(() => undefined);
        });

        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvents.mockImplementation(async () => {
            return createStatus(2);
        });
        fetchMock.mockImplementation(async (url: string) => {
            const pathMatch = url.match(/\.ergproj\/preview\/svg\/[^\?]+/);
            const path = pathMatch ? pathMatch[0] : url;
            return {
                ok: true,
                text: async () => `<svg>Content for .ergproj/preview/svg/${path.split('/').pop()}</svg>`,
            };
        });

        const { result, rerender, unmount } = renderHook(
            ({ ast, events, sessionId }) =>
                useCompiler(ast, events, sessionId, undefined, events.length),
            {
                initialProps: { ast, events: [] as QueuedDocumentEvent[], sessionId: 1 },
            }
        );

        await waitFor(() => {
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled();
            expect(tauriApiMock.startPreviewWatch).toHaveBeenCalledTimes(1);
        });

        // isCompiling should be true while waiting for the first compile result
        expect(result.current.isCompiling).toBe(true);

        // Simulate completion with source_revision 1 (latest was 1 from snapshot)
        act(() => {
            capturedListeners.onSucceeded?.({
                source_revision: 1,
                status: "succeeded",
                preview_pages: [
                    { changed: true, page_number: 1, path: ".ergproj/preview/svg/rev1-page1.svg", content: null },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        await waitFor(() => {
            expect(result.current.svgs).toEqual(["<svg>Content for .ergproj/preview/svg/rev1-page1.svg</svg>"]);
            expect(result.current.isCompiling).toBe(false);
        });

        // Trigger event that causes new sync and watch start
        rerender({
            ast,
            events: [queuedEvent(1, { type: "setProjectTitle", title: "Title 1" })],
            sessionId: 1,
        });

        await waitFor(() => {
            expect(tauriApiMock.startPreviewWatch).toHaveBeenCalledTimes(2);
            expect(result.current.isCompiling).toBe(true);
        });

        // Simulate completion of revision 2
        act(() => {
            capturedListeners.onSucceeded?.({
                source_revision: 2,
                status: "succeeded",
                preview_pages: [
                    { changed: true, page_number: 1, path: ".ergproj/preview/svg/rev2-page1.svg", content: null },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        await waitFor(() => {
            expect(result.current.isCompiling).toBe(false);
        });

        unmount();
    });

    it("clears compiler states on session change", async () => {
        const ast = createDocumentWithTitle("Test");
        let capturedListeners: any = {};

        tauriApiMock.listenToCompileEvents.mockImplementation((listeners) => {
            capturedListeners = listeners;
            return Promise.resolve(() => undefined);
        });

        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        fetchMock.mockResolvedValue({
            ok: true,
            text: async () => "<svg />",
        });

        const { result, rerender, unmount } = renderHook(
            ({ ast, events, sessionId }) =>
                useCompiler(ast, events, sessionId, undefined, events.length),
            {
                initialProps: { ast, events: [] as QueuedDocumentEvent[], sessionId: 1 },
            }
        );

        await waitFor(() => {
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled();
        });

        act(() => {
            capturedListeners.onSucceeded?.({
                source_revision: 1,
                status: "succeeded",
                preview_pages: [
                    { changed: true, page_number: 1, path: ".ergproj/preview/svg/rev1-page1.svg", content: null },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        await waitFor(() => {
            expect(result.current.previewRevision).toBe(1);
            expect(result.current.svgs.length).toBe(1);
        });

        rerender({
            ast,
            events: [],
            sessionId: 2,
        });

        expect(result.current.svgs).toEqual([]);
        expect(result.current.previewRevision).toBeNull();

        unmount();
    });

    it("reports end-to-end latency after preview SVGs are painted", async () => {
        const ast = createDocumentWithTitle("Test");
        let capturedListeners: {
            onSucceeded?: (result: unknown) => void;
        } = {};
        const editTimestamp = 1_700_000_000_000;

        vi.spyOn(Date, "now").mockReturnValue(editTimestamp + 42);

        tauriApiMock.listenToCompileEvents.mockImplementation((listeners) => {
            capturedListeners = listeners;
            return Promise.resolve(() => undefined);
        });
        tauriApiMock.startPreviewWatch.mockResolvedValue(undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvents.mockResolvedValue(createStatus(2));

        const { result, rerender, unmount } = renderHook(
            ({ ast, events, sessionId }) =>
                useCompiler(ast, events, sessionId, undefined, events.length),
            {
                initialProps: { ast, events: [] as QueuedDocumentEvent[], sessionId: 1 },
            },
        );

        await waitFor(() => {
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled();
        });

        rerender({
            ast,
            events: [
                {
                    id: 1,
                    timestamp: editTimestamp,
                    event: { type: "setProjectTitle", title: "Updated" },
                },
            ],
            sessionId: 1,
        });

        await waitFor(() => {
            expect(tauriApiMock.syncDocumentEvents).toHaveBeenCalled();
        });

        act(() => {
            capturedListeners.onSucceeded?.({
                source_revision: 2,
                status: "succeeded",
                preview_pages: [
                    {
                        changed: true,
                        page_number: 1,
                        path: ".ergproj/preview/svg/page-1.svg",
                        content: "<svg>page</svg>",
                    },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        await waitFor(() => {
            expect(result.current.svgs).toEqual(["<svg>page</svg>"]);
        });

        await act(async () => {
            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                });
            });
        });

        expect(result.current.latencyMs).toBe(42);

        vi.mocked(Date.now).mockRestore();
        unmount();
    });
});
