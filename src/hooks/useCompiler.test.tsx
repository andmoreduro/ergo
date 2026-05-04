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
    syncDocumentSnapshot: vi.fn(),
    writeSource: vi.fn(),
}));

vi.mock("../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

import { createTextPatch, useCompiler } from "./useCompiler";

const applyTextPatch = (
    previous: string,
    patch: NonNullable<ReturnType<typeof createTextPatch>>,
) => {
    const chars = Array.from(previous);
    return [
        ...chars.slice(0, patch.start),
        patch.text,
        ...chars.slice(patch.end),
    ].join("");
};

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

const CompilerHarness = ({ ast }: { ast: DocumentAST }) => {
    useCompiler(ast);
    return null;
};

describe("createTextPatch", () => {
    it("removes stale suffix text after deletion", () => {
        const previous = "Me hago entenderdkjkjfakfd f";
        const next = "Me hago entender";
        const patch = createTextPatch(previous, next);

        expect(patch).not.toBeNull();
        expect(applyTextPatch(previous, patch!)).toBe(next);
    });

    it("uses character indices for unicode text", () => {
        const previous = "Érgo 🌍 draft";
        const next = "Érgo draft";
        const patch = createTextPatch(previous, next);

        expect(patch).not.toBeNull();
        expect(applyTextPatch(previous, patch!)).toBe(next);
    });
});

describe("useCompiler source syncing", () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it("serializes rapid text changes so only the latest document snapshot is compiled", async () => {
        const longAst = createDocumentWithTitle("Me hago entenderdkjkjfakfd f");
        const shortAst = createDocumentWithTitle("Me hago entender");
        let revision = 0;
        let releaseFirstSync: (() => void) | null = null;
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
        tauriApiMock.syncDocumentSnapshot.mockImplementation(
            async (ast: DocumentAST) => {
                syncedTitles.push(ast.metadata.title);
                if (syncedTitles.length === 1) {
                    await new Promise<void>((resolve) => {
                        releaseFirstSync = resolve;
                    });
                }

                return {
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
                        templatePath: ".ergproj/template.json",
                    },
                    sourceMap: [],
                    sourceRevision: syncedTitles.length,
                };
            },
        );

        const { rerender, unmount } = render(<CompilerHarness ast={longAst} />);

        await waitFor(() => {
            expect(releaseFirstSync).not.toBeNull();
        });

        rerender(<CompilerHarness ast={shortAst} />);
        releaseFirstSync?.();

        await waitFor(() => {
            expect(syncedTitles[syncedTitles.length - 1]).toBe("Me hago entender");
        });
        expect(tauriApiMock.writeSource).not.toHaveBeenCalled();
        expect(tauriApiMock.patchSource).not.toHaveBeenCalled();
        expect(tauriApiMock.enqueuePreviewCompile).toHaveBeenCalledTimes(1);

        unmount();
    });

    it("loads preview SVGs from backend preview files", async () => {
        const ast = createDocumentWithTitle("Vista previa");

        tauriApiMock.listenToCompileEvents.mockResolvedValue(() => undefined);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue({
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
                templatePath: ".ergproj/template.json",
            },
            sourceMap: [],
            sourceRevision: 1,
        });
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
                        content_hash: 1n,
                        page_number: 1,
                        path: ".ergproj/preview/svg/page-1.svg",
                    },
                ],
                source_revision: 1,
                status: "succeeded",
                svgs: null,
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
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue({
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
                templatePath: ".ergproj/template.json",
            },
            sourceMap: [],
            sourceRevision: 1,
        });
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
                                  content_hash: 1n,
                                  page_number: 1,
                                  path: ".ergproj/preview/svg/page-1.svg",
                              },
                              {
                                  changed: true,
                                  content_hash: 2n,
                                  page_number: 2,
                                  path: ".ergproj/preview/svg/page-2.svg",
                              },
                          ]
                        : [
                              {
                                  changed: false,
                                  content_hash: 1n,
                                  page_number: 1,
                                  path: ".ergproj/preview/svg/page-1.svg",
                              },
                              {
                                  changed: true,
                                  content_hash: 3n,
                                  page_number: 2,
                                  path: ".ergproj/preview/svg/page-2.svg",
                              },
                          ],
                source_revision: queuedRevision,
                status: "succeeded",
                svgs: null,
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

        rerender(<CompilerHarness ast={updatedAst} />);

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
});
