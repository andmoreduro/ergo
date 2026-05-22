import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentAST } from "../bindings/DocumentAST";
import { createDefaultDocumentAST } from "../state/ast/defaults";

const tauriApiMock = vi.hoisted(() => ({
    enqueuePreviewCompile: vi.fn(),
    getCompileStatus: vi.fn(),
    listenToCompileEvents: vi.fn(),
    patchSource: vi.fn(),
    readPreviewSvg: vi.fn(),
    syncDocumentEvent: vi.fn(),
    syncDocumentSnapshot: vi.fn(),
    writeSource: vi.fn(),
}));

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
    useCompiler(ast, events, sessionId);
    return null;
};

describe("useCompiler source syncing", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("drains document events in order without sending snapshots for edits", async () => {
        const ast = createDocumentWithTitle("Me hago entender");
        let revision = 0;
        let releaseFirstEvent: (() => void) | null = null;
        const syncedTitles: string[] = [];

        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.getCompileStatus.mockResolvedValue({
            active_job_id: null,
            last_result: null,
            latest_source_revision: 0,
            queued_export_count: 0,
            queued_preview_job_id: null,
        });
        tauriApiMock.enqueuePreviewCompile.mockImplementation(async () => {
            revision += 1;
            return {
                job_id: revision,
                kind: { type: "previewSvg" },
                priority: "preview",
                source_revision: revision,
            };
        });
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvent.mockImplementation(
            async (event: QueuedDocumentEvent["event"]) => {
                syncedTitles.push(
                    event.type === "setProjectTitle" ? event.title : "",
                );
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
        expect(tauriApiMock.syncDocumentEvent).toHaveBeenCalledTimes(2);
        expect(tauriApiMock.enqueuePreviewCompile).toHaveBeenCalledTimes(3);

        unmount();
    });

    it("loads preview SVGs from backend preview files", async () => {
        const ast = createDocumentWithTitle("Vista previa");

        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.enqueuePreviewCompile.mockResolvedValue({
            job_id: 1,
            kind: { type: "previewSvg" },
            priority: "preview",
            source_revision: 1,
        });
        tauriApiMock.getCompileStatus.mockResolvedValue({
            active_job_id: null,
            latest_source_revision: 1,
            queued_export_count: 0,
            queued_preview_job_id: null,
            last_result: {
                diagnostics: [],
                export_path: ".ergproj/preview/svg",
                job_id: 1,
                kind: { type: "previewSvg" },
                preview_pages: [
                    {
                        changed: true,
                        page_number: 1,
                        path: ".ergproj/preview/svg/page-1.svg",
                    },
                ],
                source_revision: 1,
                status: "succeeded",
            },
        });
        tauriApiMock.readPreviewSvg.mockResolvedValue("<svg />");

        const { unmount } = render(<CompilerHarness ast={ast} />);

        await waitFor(() => {
            expect(tauriApiMock.readPreviewSvg).toHaveBeenCalledWith(
                ".ergproj/preview/svg/page-1.svg",
            );
        });

        unmount();
    });

    it("reuses unchanged preview SVG pages after incremental preview updates", async () => {
        const ast = createDocumentWithTitle("Vista previa");
        const updatedAst = createDocumentWithTitle("Vista previa actualizada");
        let queuedRevision = 0;

        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvent.mockResolvedValue(createStatus(2));
        tauriApiMock.enqueuePreviewCompile.mockImplementation(async () => {
            queuedRevision += 1;
            return {
                job_id: queuedRevision,
                kind: { type: "previewSvg" },
                priority: "preview",
                source_revision: queuedRevision,
            };
        });
        tauriApiMock.getCompileStatus.mockImplementation(async () => ({
            active_job_id: null,
            latest_source_revision: queuedRevision,
            queued_export_count: 0,
            queued_preview_job_id: null,
            last_result: {
                diagnostics: [],
                export_path: ".ergproj/preview/svg",
                job_id: queuedRevision,
                kind: { type: "previewSvg" },
                preview_pages:
                    queuedRevision === 1
                        ? [
                              {
                                  changed: true,
                                  page_number: 1,
                                  path: ".ergproj/preview/svg/page-1.svg",
                              },
                              {
                                  changed: true,
                                  page_number: 2,
                                  path: ".ergproj/preview/svg/page-2.svg",
                              },
                          ]
                        : [
                              {
                                  changed: false,
                                  page_number: 1,
                                  path: ".ergproj/preview/svg/page-1.svg",
                              },
                              {
                                  changed: true,
                                  page_number: 2,
                                  path: ".ergproj/preview/svg/page-2.svg",
                              },
                          ],
                source_revision: queuedRevision,
                status: "succeeded",
            },
        }));
        tauriApiMock.readPreviewSvg
            .mockResolvedValueOnce("<svg>one</svg>")
            .mockResolvedValueOnce("<svg>two</svg>")
            .mockResolvedValueOnce("<svg>three</svg>");

        const { rerender, unmount } = render(<CompilerHarness ast={ast} />);

        await waitFor(() => {
            expect(tauriApiMock.readPreviewSvg).toHaveBeenCalledTimes(2);
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

        await waitFor(() => {
            expect(tauriApiMock.readPreviewSvg).toHaveBeenCalledTimes(3);
        });
        expect(
            tauriApiMock.readPreviewSvg.mock.calls.filter(
                ([path]) => path === ".ergproj/preview/svg/page-1.svg",
            ),
        ).toHaveLength(1);

        unmount();
    });

    it("surfaces event sync failures without snapshot resync", async () => {
        const ast = createDocumentWithTitle("Base");
        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvent.mockRejectedValue(
            new Error("stale document event"),
        );
        tauriApiMock.enqueuePreviewCompile.mockResolvedValue({
            job_id: 1,
            kind: { type: "previewSvg" },
            priority: "preview",
            source_revision: 1,
        });
        tauriApiMock.getCompileStatus.mockResolvedValue({
            active_job_id: null,
            last_result: null,
            latest_source_revision: 1,
            queued_export_count: 0,
            queued_preview_job_id: null,
        });

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
            expect(tauriApiMock.syncDocumentEvent).toHaveBeenCalledTimes(1);
        });
        expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalledTimes(1);
        expect(tauriApiMock.syncDocumentEvent).not.toHaveBeenCalledWith(
            expect.objectContaining({ title: "Must not continue" }),
        );

        unmount();
    });

    it("renders intermediate revisions sequentially and preserves isCompiling until the latest queued revision finishes", async () => {
        const ast = createDocumentWithTitle("Test");
        let capturedListeners: any = {};

        tauriApiMock.listenToCompileEvents.mockImplementation((listeners) => {
            capturedListeners = listeners;
            return Promise.resolve(() => undefined);
        });

        let nextRevision = 1;
        tauriApiMock.enqueuePreviewCompile.mockImplementation(async () => {
            const rev = nextRevision;
            nextRevision += 1;
            return {
                job_id: rev,
                kind: { type: "previewSvg" },
                priority: "preview",
                source_revision: rev,
            };
        });

        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvent.mockImplementation(async () => {
            return createStatus(nextRevision);
        });
        tauriApiMock.getCompileStatus.mockResolvedValue({
            active_job_id: null,
            latest_source_revision: 1,
            queued_export_count: 0,
            queued_preview_job_id: null,
            last_result: null,
        });
        tauriApiMock.readPreviewSvg.mockImplementation(async (path) => {
            return `<svg>Content for ${path}</svg>`;
        });

        const { result, rerender, unmount } = renderHook(
            ({ ast, events, sessionId }) => useCompiler(ast, events, sessionId),
            {
                initialProps: { ast, events: [] as QueuedDocumentEvent[], sessionId: 1 },
            }
        );

        // Wait for first sync & enqueue to finish
        await waitFor(() => {
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled();
            expect(tauriApiMock.enqueuePreviewCompile).toHaveBeenCalledTimes(1);
        });

        // Trigger two events sequentially to queue up revision 2 and 3
        rerender({
            ast,
            events: [queuedEvent(1, { type: "setProjectTitle", title: "Title 1" })],
            sessionId: 1,
        });

        await waitFor(() => {
            expect(tauriApiMock.enqueuePreviewCompile).toHaveBeenCalledTimes(2);
        });

        rerender({
            ast,
            events: [
                queuedEvent(1, { type: "setProjectTitle", title: "Title 1" }),
                queuedEvent(2, { type: "setProjectTitle", title: "Title 2" }),
            ],
            sessionId: 1,
        });

        await waitFor(() => {
            expect(tauriApiMock.enqueuePreviewCompile).toHaveBeenCalledTimes(3);
        });

        // Now we have latest revision = 3
        // Simulate completion of revision 1 (succeeded compile event)
        act(() => {
            capturedListeners.onSucceeded?.({
                job_id: 1,
                kind: { type: "previewSvg" },
                source_revision: 1,
                status: "succeeded",
                preview_pages: [
                    {
                        changed: true,
                        page_number: 1,
                        path: ".ergproj/preview/svg/rev1-page1.svg",
                    },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        // Wait for revision 1 to load and render.
        // It is newer than null, so it should render, but isCompiling should remain true because 1 < 3
        await waitFor(() => {
            expect(result.current.svgs).toEqual(["<svg>Content for .ergproj/preview/svg/rev1-page1.svg</svg>"]);
            expect(result.current.isCompiling).toBe(true);
            expect(result.current.previewRevision).toBe(1);
        });

        // Simulate completion of revision 2
        act(() => {
            capturedListeners.onSucceeded?.({
                job_id: 2,
                kind: { type: "previewSvg" },
                source_revision: 2,
                status: "succeeded",
                preview_pages: [
                    {
                        changed: true,
                        page_number: 1,
                        path: ".ergproj/preview/svg/rev2-page1.svg",
                    },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        // Wait for revision 2 to render, isCompiling still true
        await waitFor(() => {
            expect(result.current.svgs).toEqual(["<svg>Content for .ergproj/preview/svg/rev2-page1.svg</svg>"]);
            expect(result.current.isCompiling).toBe(true);
            expect(result.current.previewRevision).toBe(2);
        });

        // Simulate completion of revision 3
        act(() => {
            capturedListeners.onSucceeded?.({
                job_id: 3,
                kind: { type: "previewSvg" },
                source_revision: 3,
                status: "succeeded",
                preview_pages: [
                    {
                        changed: true,
                        page_number: 1,
                        path: ".ergproj/preview/svg/rev3-page1.svg",
                    },
                ],
                export_path: null,
                diagnostics: [],
                outline: null,
                resources: null,
            });
        });

        // Wait for revision 3 to render. Since 3 >= 3, isCompiling should become false!
        await waitFor(() => {
            expect(result.current.svgs).toEqual(["<svg>Content for .ergproj/preview/svg/rev3-page1.svg</svg>"]);
            expect(result.current.isCompiling).toBe(false);
            expect(result.current.previewRevision).toBe(3);
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

        let nextRevision = 1;
        tauriApiMock.enqueuePreviewCompile.mockImplementation(async () => {
            const rev = nextRevision;
            nextRevision += 1;
            return {
                job_id: rev,
                kind: { type: "previewSvg" },
                priority: "preview",
                source_revision: rev,
            };
        });

        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.getCompileStatus.mockResolvedValue({
            active_job_id: null,
            latest_source_revision: 1,
            queued_export_count: 0,
            queued_preview_job_id: null,
            last_result: null,
        });
        tauriApiMock.readPreviewSvg.mockResolvedValue("<svg />");

        const { result, rerender, unmount } = renderHook(
            ({ ast, events, sessionId }) => useCompiler(ast, events, sessionId),
            {
                initialProps: { ast, events: [] as QueuedDocumentEvent[], sessionId: 1 },
            }
        );

        // Wait for initial load
        await waitFor(() => {
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled();
        });

        // Simulate success for revision 1
        act(() => {
            capturedListeners.onSucceeded?.({
                job_id: 1,
                kind: { type: "previewSvg" },
                source_revision: 1,
                status: "succeeded",
                preview_pages: [
                    {
                        changed: true,
                        page_number: 1,
                        path: ".ergproj/preview/svg/rev1-page1.svg",
                    },
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

        // Now, switch sessionId
        rerender({
            ast,
            events: [],
            sessionId: 2,
        });

        // The states (svgs, previewRevision) should be cleared immediately
        expect(result.current.svgs).toEqual([]);
        expect(result.current.previewRevision).toBeNull();

        unmount();
    });
});
