import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentAST } from "../bindings/DocumentAST";
import { createDefaultDocumentAST } from "../state/ast/defaults";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import { useDocumentCompilerSync } from "./useDocumentCompilerSync";

const tauriApiMock = vi.hoisted(() => ({
    loadTemplatePackageFiles: vi.fn(),
    syncDocumentEvents: vi.fn(),
    syncDocumentSnapshot: vi.fn(),
}));

const compilerClientMock = vi.hoisted(() => ({
    bootstrap: vi.fn(),
    compile: vi.fn(),
    syncEvents: vi.fn(),
}));

const syncBarrierMock = vi.hoisted(() => ({
    activeSync: null as Promise<void> | null,
    setActiveDocumentSync: vi.fn((sync: Promise<void>) => {
        syncBarrierMock.activeSync = sync;
    }),
}));

vi.mock("../api/tauri", () => ({
    TauriApi: tauriApiMock,
}));

vi.mock("../workers/compilerClient", () => ({
    CompilerClient: compilerClientMock,
}));

vi.mock("./documentSyncBarrier", () => ({
    setActiveDocumentSync: syncBarrierMock.setActiveDocumentSync,
}));

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const status = (sourceRevision: number) => ({
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

const compileResult = (sourceRevision: number) => ({
    source_revision: sourceRevision,
    status: "succeeded",
    preview_pages: [],
    export_path: null,
    diagnostics: [],
    outline: null,
    resources: null,
});

interface HarnessProps {
    ast: DocumentAST;
    events: QueuedDocumentEvent[];
    ackDocumentEvents: (upToEventId: number) => void;
}

const Harness = ({ ast, events, ackDocumentEvents }: HarnessProps) => {
    useDocumentCompilerSync({
        ast,
        events,
        sessionId: 1,
        ackDocumentEvents,
        eventsVersion: events.length,
        bootstrapFiles: null,
        preview: {
            setPreviewPages: vi.fn(),
            setIsCompiling: vi.fn(),
            setError: vi.fn(),
            setSourceMap: vi.fn(),
            setPreviewRevision: vi.fn(),
            setOutline: vi.fn(),
            setResources: vi.fn(),
            setLatencyMs: vi.fn(),
            previewRevisionRef: { current: null },
            latestRevisionRef: { current: null },
            inputLatencyStartRef: { current: null },
        },
    });

    return null;
};

describe("useDocumentCompilerSync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        syncBarrierMock.activeSync = null;
        tauriApiMock.loadTemplatePackageFiles.mockResolvedValue([]);
        tauriApiMock.syncDocumentSnapshot.mockResolvedValue(status(1));
        tauriApiMock.syncDocumentEvents.mockResolvedValue(status(2));
        compilerClientMock.bootstrap.mockResolvedValue({
            status: status(1),
            result: compileResult(1),
        });
        compilerClientMock.syncEvents.mockResolvedValue(status(2));
        compilerClientMock.compile.mockResolvedValue(compileResult(2));
    });

    it("keeps the active sync barrier pending until backend event mirroring succeeds", async () => {
        const ackDocumentEvents = vi.fn();
        const initialAst = createDefaultDocumentAST();
        const { rerender } = render(
            <Harness ast={initialAst} events={[]} ackDocumentEvents={ackDocumentEvents} />,
        );

        await waitFor(() => expect(compilerClientMock.bootstrap).toHaveBeenCalled());
        await waitFor(() =>
            expect(tauriApiMock.syncDocumentSnapshot).toHaveBeenCalled(),
        );

        const mirror = deferred<ReturnType<typeof status>>();
        tauriApiMock.syncDocumentEvents.mockReturnValue(mirror.promise);
        const nextAst = {
            ...initialAst,
            metadata: { ...initialAst.metadata, title: "Mirrored title" },
        };
        const event: QueuedDocumentEvent = {
            id: 1,
            timestamp: Date.now(),
            event: { type: "setProjectTitle", title: "Mirrored title" },
        };

        rerender(
            <Harness
                ast={nextAst}
                events={[event]}
                ackDocumentEvents={ackDocumentEvents}
            />,
        );

        await waitFor(() => expect(compilerClientMock.syncEvents).toHaveBeenCalled());
        await waitFor(() => expect(compilerClientMock.compile).toHaveBeenCalled());
        await waitFor(() => expect(tauriApiMock.syncDocumentEvents).toHaveBeenCalled());

        let barrierSettled = false;
        syncBarrierMock.activeSync?.then(() => {
            barrierSettled = true;
        });
        await Promise.resolve();

        expect(ackDocumentEvents).not.toHaveBeenCalled();
        expect(barrierSettled).toBe(false);

        mirror.resolve(status(2));

        await waitFor(() => expect(ackDocumentEvents).toHaveBeenCalledWith(1));
        await waitFor(() => expect(barrierSettled).toBe(true));
    });
});
