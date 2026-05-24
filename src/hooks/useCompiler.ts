import { useState, useEffect, useRef } from "react";

import type { DocumentAST } from "../bindings/DocumentAST";

import type { ProjectFile } from "../bindings/ProjectFile";

import { TauriApi } from "../api/tauri";

import { CompilerClient } from "../workers/compilerClient";

import { projectFilesToVfsEntries } from "../workers/compilerProtocol";

import type { CompilationResult } from "../bindings/CompilationResult";

import type { SourceMapEntry } from "../bindings/SourceMapEntry";

import type { QueuedDocumentEvent } from "../state/DocumentContext";

import { setActiveDocumentSync } from "./documentSyncBarrier";

import type { DocumentOutline } from "../bindings/DocumentOutline";

import type { DocumentResources } from "../bindings/DocumentResources";

import type { PreviewPageFile } from "../bindings/PreviewPageFile";



type SourceRevision = number;



interface UseCompilerResult {

    previewPages: PreviewPageFile[];

    isCompiling: boolean;

    error: string | null;

    sourceMap: SourceMapEntry[];

    previewRevision: SourceRevision | null;

    outline: DocumentOutline | null;

    resources: DocumentResources | null;

    latencyMs: number | null;

}



export function useCompiler(

    ast: DocumentAST | null | undefined,

    events: QueuedDocumentEvent[] = [],

    sessionId = 1,

    ackDocumentEvents?: (upToEventId: number) => void,

    eventsVersion = 0,

    bootstrapFiles: ProjectFile[] | null = null,

): UseCompilerResult {

    const [previewPages, setPreviewPages] = useState<PreviewPageFile[]>([]);

    const [isCompiling, setIsCompiling] = useState<boolean>(false);

    const [error, setError] = useState<string | null>(null);

    const [sourceMap, setSourceMap] = useState<SourceMapEntry[]>([]);

    const [previewRevision, setPreviewRevision] = useState<SourceRevision | null>(null);

    const [outline, setOutline] = useState<DocumentOutline | null>(null);

    const [resources, setResources] = useState<DocumentResources | null>(null);

    const [latencyMs, setLatencyMs] = useState<number | null>(null);



    const desiredAstRef = useRef<DocumentAST | null>(null);

    const desiredEventsRef = useRef<QueuedDocumentEvent[]>([]);

    const desiredSessionIdRef = useRef(sessionId);

    const desiredBootstrapFilesRef = useRef<ProjectFile[] | null>(null);

    const bootstrappedSessionIdRef = useRef<number | null>(null);

    const syncedEventIdRef = useRef(0);

    const latestRevisionRef = useRef<SourceRevision | null>(null);

    const previewRevisionRef = useRef<SourceRevision | null>(null);

    const inputLatencyStartRef = useRef<number | null>(null);

    const syncRunningRef = useRef(false);

    const syncFailedRef = useRef(false);

    const failedEventCountRef = useRef(0);

    const isMountedRef = useRef(false);



    const isNewerPreviewResult = (result: CompilationResult): boolean => {

        return (

            previewRevisionRef.current === null ||

            result.source_revision > previewRevisionRef.current

        );

    };



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

        ast: DocumentAST,

        pendingEvents: QueuedDocumentEvent[],

        isBootstrap: boolean,

    ) => {

        if (isBootstrap) {

            void TauriApi.syncDocumentSnapshot(ast);

            return;

        }

        if (pendingEvents.length > 0) {

            void TauriApi.syncDocumentEvents(

                pendingEvents.map((event) => event.event),

            );

        }

    };



    const syncLatestDocumentState = async () => {

        if (syncRunningRef.current || syncFailedRef.current) {

            return;

        }



        syncRunningRef.current = true;



        try {

            while (isMountedRef.current) {

                const ast = desiredAstRef.current;

                const currentSessionId = desiredSessionIdRef.current;

                if (ast === null) {

                    break;

                }



                if (bootstrappedSessionIdRef.current !== currentSessionId) {

                    const vfsFiles = [

                        ...projectFilesToVfsEntries(

                            desiredBootstrapFilesRef.current ?? [],

                        ),

                    ];



                    try {

                        const templateId = ast.metadata.template_id;

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



                    const bootstrapStarted = now();

                    const { status, result } = await CompilerClient.bootstrap({

                        ast,

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



                    mirrorToBackend(ast, [], true);

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

                const syncStarted = now();



                const status = await CompilerClient.syncEvents(
                    ast,
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



                syncedEventIdRef.current = lastEvent.id;

                latestRevisionRef.current = status.sourceRevision;

                setSourceMap(status.sourceMap);

                ackDocumentEvents?.(lastEvent.id);



                const compileStarted = now();

                const result = await CompilerClient.compile(ast);

                recordTiming("compile", compileStarted);

                applyPreviewResult(result);



                mirrorToBackend(ast, pendingEvents, false);

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



    return { previewPages, isCompiling, error, sourceMap, previewRevision, outline, resources, latencyMs };

}



type TimingSample = {

    name: string;

    durationMs: number;

    startedAt: number;

    endedAt: number;

};



const now = (): number =>

    typeof performance === "undefined" ? Date.now() : performance.now();



const recordTiming = (name: string, startedAt: number) => {

    const endedAt = now();

    recordTimingSample({

        name,

        durationMs: endedAt - startedAt,

        startedAt,

        endedAt,

    });

};



const recordDurationFromTimestamp = (name: string, timestamp: number) => {

    if (!timestamp) {

        return;

    }



    const endedAt = Date.now();

    recordTimingSample({

        name,

        durationMs: Math.max(0, endedAt - timestamp),

        startedAt: timestamp,

        endedAt,

    });

};



const recordTimingSample = (sample: TimingSample) => {

    if (!import.meta.env.DEV || typeof window === "undefined") {

        return;

    }



    const timingWindow = window as typeof window & {

        __ergo_timings?: TimingSample[];

    };

    const samples = timingWindow.__ergo_timings ?? [];

    samples.push(sample);

    timingWindow.__ergo_timings = samples.slice(-50);

};


