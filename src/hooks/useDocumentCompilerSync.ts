import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentOutline } from "../bindings/DocumentOutline";
import type { DocumentResources } from "../bindings/DocumentResources";
import type { PreviewPageFile } from "../bindings/PreviewPageFile";
import type { ProjectFile } from "../bindings/ProjectFile";
import type { SourceMapEntry } from "../bindings/SourceMapEntry";
import { TauriApi } from "../api/tauri";
import { CompilerClient } from "../workers/compilerClient";
import { projectFilesToVfsEntries } from "../workers/compilerProtocol";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import { setActiveDocumentSync } from "./documentSyncBarrier";
import {
    recordDurationFromTimestamp,
    recordTiming,
    timingNow,
} from "./compilerTimings";

type SourceRevision = number;

export interface CompilerPreviewSetters {
    setPreviewPages: Dispatch<SetStateAction<PreviewPageFile[]>>;
    setIsCompiling: Dispatch<SetStateAction<boolean>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setSourceMap: Dispatch<SetStateAction<SourceMapEntry[]>>;
    setPreviewRevision: Dispatch<SetStateAction<SourceRevision | null>>;
    setOutline: Dispatch<SetStateAction<DocumentOutline | null>>;
    setResources: Dispatch<SetStateAction<DocumentResources | null>>;
    setLatencyMs: Dispatch<SetStateAction<number | null>>;
    previewRevisionRef: MutableRefObject<SourceRevision | null>;
    latestRevisionRef: MutableRefObject<SourceRevision | null>;
    inputLatencyStartRef: MutableRefObject<number | null>;
}

export interface UseDocumentCompilerSyncParams {
    ast: DocumentAST | null | undefined;
    events: QueuedDocumentEvent[];
    sessionId: number;
    ackDocumentEvents?: (upToEventId: number) => void;
    eventsVersion: number;
    bootstrapFiles: ProjectFile[] | null;
    preview: CompilerPreviewSetters;
}

export function useDocumentCompilerSync({
    ast,
    events,
    sessionId,
    ackDocumentEvents,
    eventsVersion,
    bootstrapFiles,
    preview,
}: UseDocumentCompilerSyncParams): void {
    const {
        setPreviewPages,
        setIsCompiling,
        setError,
        setSourceMap,
        setPreviewRevision,
        setOutline,
        setResources,
        setLatencyMs,
        previewRevisionRef,
        latestRevisionRef,
        inputLatencyStartRef,
    } = preview;

    const desiredAstRef = useRef<DocumentAST | null>(null);
    const desiredEventsRef = useRef<QueuedDocumentEvent[]>([]);
    const desiredSessionIdRef = useRef(sessionId);
    const desiredBootstrapFilesRef = useRef<ProjectFile[] | null>(null);
    const bootstrappedSessionIdRef = useRef<number | null>(null);
    const syncedEventIdRef = useRef(0);
    const syncRunningRef = useRef(false);
    const syncFailedRef = useRef(false);
    const failedEventCountRef = useRef(0);
    const isMountedRef = useRef(false);

    const isNewerPreviewResult = (result: CompilationResult): boolean =>
        previewRevisionRef.current === null ||
        result.source_revision > previewRevisionRef.current;

    const scheduleEndToEndLatency = () => {
        const startedAt = inputLatencyStartRef.current;
        if (startedAt === null) {
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!isMountedRef.current) {
                    return;
                }
                setLatencyMs(Math.max(0, Math.round(Date.now() - startedAt)));
                inputLatencyStartRef.current = null;
            });
        });
    };

    const applyPreviewResult = (result: CompilationResult) => {
        if (!isNewerPreviewResult(result)) {
            return;
        }

        if (result.status === "succeeded") {
            setOutline(result.outline);
            if (result.resources) {
                setResources(result.resources);
            }
            setPreviewPages(result.preview_pages || []);
            setPreviewRevision(result.source_revision);
            previewRevisionRef.current = result.source_revision;
            setError(null);
            if (
                latestRevisionRef.current === null ||
                result.source_revision >= latestRevisionRef.current
            ) {
                setIsCompiling(false);
            }
            scheduleEndToEndLatency();
        } else if (result.status === "failed") {
            setError(result.diagnostics.join("\n") || "Compilation failed");
            if (
                latestRevisionRef.current === null ||
                result.source_revision >= latestRevisionRef.current
            ) {
                setIsCompiling(false);
            }
        }
    };

    const hasPendingSync = () => {
        if (desiredAstRef.current === null) {
            return false;
        }
        if (bootstrappedSessionIdRef.current !== desiredSessionIdRef.current) {
            return true;
        }
        return desiredEventsRef.current.some(
            (event) => event.id > syncedEventIdRef.current,
        );
    };

    const mirrorToBackend = (
        mirrorAst: DocumentAST,
        pendingEvents: QueuedDocumentEvent[],
        isBootstrap: boolean,
    ): Promise<unknown> => {
        if (isBootstrap) {
            return TauriApi.syncDocumentSnapshot(mirrorAst);
        }
        if (pendingEvents.length > 0) {
            return TauriApi.syncDocumentEvents(
                pendingEvents.map((event) => event.event),
            );
        }
        return Promise.resolve();
    };

    const syncLatestDocumentState = async () => {
        if (syncRunningRef.current || syncFailedRef.current) {
            return;
        }

        syncRunningRef.current = true;

        try {
            while (isMountedRef.current) {
                const currentAst = desiredAstRef.current;
                const currentSessionId = desiredSessionIdRef.current;
                if (currentAst === null) {
                    break;
                }

                if (bootstrappedSessionIdRef.current !== currentSessionId) {
                    const vfsFiles = [
                        ...projectFilesToVfsEntries(
                            desiredBootstrapFilesRef.current ?? [],
                        ),
                    ];

                    try {
                        const templateId = currentAst.metadata.template_id;
                        if (templateId) {
                            const templatePackageFiles =
                                await TauriApi.loadTemplatePackageFiles(templateId);
                            vfsFiles.push(
                                ...projectFilesToVfsEntries(templatePackageFiles),
                            );
                        }
                    } catch (loadError) {
                        console.error("Failed to load template package files:", loadError);
                    }

                    const bootstrapStarted = timingNow();
                    const { status, result } = await CompilerClient.bootstrap({
                        ast: currentAst,
                        files: vfsFiles,
                    });
                    recordTiming("bootstrap", bootstrapStarted);

                    if (
                        !isMountedRef.current ||
                        desiredSessionIdRef.current !== currentSessionId
                    ) {
                        continue;
                    }

                    bootstrappedSessionIdRef.current = currentSessionId;
                    syncedEventIdRef.current = 0;
                    latestRevisionRef.current = status.sourceRevision;
                    setSourceMap(status.sourceMap);
                    applyPreviewResult(result);

                    await mirrorToBackend(currentAst, [], true);
                    continue;
                }

                const pendingEvents = desiredEventsRef.current.filter(
                    (event) => event.id > syncedEventIdRef.current,
                );
                if (pendingEvents.length === 0) {
                    break;
                }

                const firstTimestamp = pendingEvents[0]?.timestamp ?? 0;
                recordDurationFromTimestamp("event-dispatch", firstTimestamp);
                const syncStarted = timingNow();

                const status = await CompilerClient.syncEvents(
                    currentAst,
                    pendingEvents.map((event) => event.event),
                );

                recordTiming("sync-events", syncStarted);
                if (
                    !isMountedRef.current ||
                    desiredSessionIdRef.current !== currentSessionId
                ) {
                    continue;
                }

                const lastEvent = pendingEvents[pendingEvents.length - 1];
                inputLatencyStartRef.current = lastEvent.timestamp;

                latestRevisionRef.current = status.sourceRevision;
                setSourceMap(status.sourceMap);

                const mirrorPromise = mirrorToBackend(
                    currentAst,
                    pendingEvents,
                    false,
                );

                const compileStarted = timingNow();
                const result = await CompilerClient.compile(currentAst);
                recordTiming("compile", compileStarted);
                applyPreviewResult(result);

                await mirrorPromise;

                syncedEventIdRef.current = lastEvent.id;
                ackDocumentEvents?.(lastEvent.id);
            }
        } catch (syncError: unknown) {
            if (isMountedRef.current) {
                syncFailedRef.current = true;
                failedEventCountRef.current = desiredEventsRef.current.length;
                setError(
                    syncError instanceof Error ? syncError.message : String(syncError),
                );
                setIsCompiling(false);
            }
        } finally {
            syncRunningRef.current = false;

            if (isMountedRef.current && !syncFailedRef.current && hasPendingSync()) {
                void syncLatestDocumentState();
            }
        }
    };

    const startDocumentSync = () => {
        if (syncRunningRef.current) {
            return;
        }

        const sync = syncLatestDocumentState();
        setActiveDocumentSync(sync);
        void sync;
    };

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!ast) {
            desiredAstRef.current = null;
            desiredEventsRef.current = [];
            desiredBootstrapFilesRef.current = null;
            setPreviewPages([]);
            setSourceMap([]);
            setPreviewRevision(null);
            previewRevisionRef.current = null;
            setOutline(null);
            setResources(null);
            setLatencyMs(null);
            return;
        }

        const didSessionChange = desiredSessionIdRef.current !== sessionId;
        desiredAstRef.current = ast;
        desiredEventsRef.current = events;
        desiredSessionIdRef.current = sessionId;
        desiredBootstrapFilesRef.current = bootstrapFiles;

        if (
            didSessionChange ||
            (syncFailedRef.current && events.length > failedEventCountRef.current)
        ) {
            syncFailedRef.current = false;
            if (didSessionChange) {
                setPreviewPages([]);
                setPreviewRevision(null);
                previewRevisionRef.current = null;
                latestRevisionRef.current = null;
                setOutline(null);
                setResources(null);
                setLatencyMs(null);
            }
        }

        setError(null);
        if (hasPendingSync()) {
            setIsCompiling(true);
            startDocumentSync();
        }
    }, [ackDocumentEvents, ast, sessionId, eventsVersion, bootstrapFiles]);
}
