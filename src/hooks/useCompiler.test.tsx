import { render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentAST } from "../bindings/DocumentAST";
import { createDefaultDocumentAST } from "../state/ast/defaults";

const tauriApiMock = vi.hoisted(() => ({
    syncDocumentSnapshot: vi.fn(),
    syncDocumentEvents: vi.fn(),
    loadTemplatePackageFiles: vi.fn().mockResolvedValue([]),
}));

const compilerClientMock = vi.hoisted(() => ({
    bootstrap: vi.fn(),
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
    exportPngPages: vi.fn(),
}));

vi.mock("../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

vi.mock("../workers/compilerClient", () => ({
    CompilerClient: compilerClientMock,
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

describe("useCompiler source syncing", () => {
    const succeededCompile = (sourceRevision: number) => ({
        source_revision: sourceRevision,
        status: "succeeded" as const,
        preview_pages: [
            { changed: true, page_number: 1, path: "page-1", content: null },
        ],
        export_path: null,
        diagnostics: [],
        outline: null,
        resources: null,
    });

    beforeEach(() => {
        compilerClientMock.bootstrap.mockResolvedValue({
            status: createStatus(1),
            result: succeededCompile(1),
        });
        compilerClientMock.syncEvents.mockResolvedValue(createStatus(2));
        compilerClientMock.compile.mockResolvedValue(succeededCompile(1));
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(createStatus(1));
        tauriApiMock.syncDocumentEvents.mockResolvedValue(createStatus(2));
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("batches pending document events into one wasm sync without resending snapshots", async () => {
        const ast = createDocumentWithTitle("Me hago entender");

        const { unmount } = render(
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

        await waitFor(() => {
            expect(compilerClientMock.bootstrap).toHaveBeenCalledTimes(1);
            expect(compilerClientMock.syncEvents).toHaveBeenCalledWith(
                ast,
                [
                    { type: "setProjectTitle", title: "Me hago entenderd" },
                    { type: "setProjectTitle", title: "Me hago entender" },
                ],
            );
        });

        unmount();
    });

    it("clears compiler states on session change", async () => {
        const ast = createDocumentWithTitle("Test");

        const { result, rerender, unmount } = renderHook(
            ({ ast, events, sessionId }) =>
                useCompiler(ast, events, sessionId, undefined, events.length),
            {
                initialProps: { ast, events: [] as QueuedDocumentEvent[], sessionId: 1 },
            }
        );

        await waitFor(() => {
            expect(compilerClientMock.bootstrap).toHaveBeenCalled();
            expect(result.current.previewRevision).toBe(1);
        });

        rerender({
            ast,
            events: [],
            sessionId: 2,
        });

        expect(result.current.previewPages).toEqual([]);
        expect(result.current.previewRevision).toBeNull();

        unmount();
    });

    it("stores latency start timestamp after sync for downstream measurement", async () => {
        const ast = createDocumentWithTitle("Test");
        const editTimestamp = 1_700_000_000_000;

        compilerClientMock.compile.mockResolvedValue(succeededCompile(2));

        const { result, rerender, unmount } = renderHook(
            ({ ast, events, sessionId }) =>
                useCompiler(ast, events, sessionId, undefined, events.length),
            {
                initialProps: { ast, events: [] as QueuedDocumentEvent[], sessionId: 1 },
            },
        );

        await waitFor(() => {
            expect(compilerClientMock.bootstrap).toHaveBeenCalled();
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
            expect(compilerClientMock.syncEvents).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(result.current.latencyStartRef.current).toBe(editTimestamp);
        });

        unmount();
    });
});
