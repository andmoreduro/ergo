import { render, waitFor } from "@testing-library/react";
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
});
