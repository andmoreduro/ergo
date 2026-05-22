import { useState, useEffect, useRef } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import { TauriApi } from "../api/tauri";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { SourceMapEntry } from "../bindings/SourceMapEntry";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import { setActiveDocumentSync } from "./documentSyncBarrier";
import { useCompileBridge } from "./useCompileBridge";
import { loadChangedPreviewSvgs } from "./useSvgLoader";
import type { DocumentOutline } from "../bindings/DocumentOutline";
import type { DocumentResources } from "../bindings/DocumentResources";

type SourceRevision = number;

interface UseCompilerResult {
    svgs: string[];
    isCompiling: boolean;
    error: string | null;
    sourceMap: SourceMapEntry[];
    previewRevision: SourceRevision | null;
    outline: DocumentOutline | null;
    resources: DocumentResources | null;
}

export function useCompiler(
    ast: DocumentAST | null | undefined,
    events: QueuedDocumentEvent[] = [],
    sessionId = 1,
    previewDebounceMs = 0,
    ackDocumentEvents?: (upToEventId: number) => void,
): UseCompilerResult {
    const [svgs, setSvgs] = useState<string[]>([]);
    const [isCompiling, setIsCompiling] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceMap, setSourceMap] = useState<SourceMapEntry[]>([]);
    const [previewRevision, setPreviewRevision] = useState<SourceRevision | null>(null);
    const [outline, setOutline] = useState<DocumentOutline | null>(null);
    const [resources, setResources] = useState<DocumentResources | null>(null);
    const desiredAstRef = useRef<DocumentAST | null>(null);
    const desiredEventsRef = useRef<QueuedDocumentEvent[]>([]);
    const desiredSessionIdRef = useRef(sessionId);
    const bootstrappedSessionIdRef = useRef<number | null>(null);
    const syncedEventIdRef = useRef(0);
    const latestRevisionRef = useRef<SourceRevision | null>(null);
    const previewRevisionRef = useRef<SourceRevision | null>(null);
    const listenersReadyRef = useRef<Promise<void>>(Promise.resolve());
    const syncRunningRef = useRef(false);
    const syncFailedRef = useRef(false);
    const failedEventCountRef = useRef(0);
    const isMountedRef = useRef(false);
    const previewLoadTokenRef = useRef(0);
    const svgsRef = useRef<string[]>([]);
    const previewDebounceMsRef = useRef(previewDebounceMs);
    previewDebounceMsRef.current = previewDebounceMs;

    const isNewerPreviewResult = (result: CompilationResult): boolean => {
        return (
            result.kind.type === "previewSvg" &&
            (previewRevisionRef.current === null ||
                result.source_revision > previewRevisionRef.current)
        );
    };

    const loadPreviewSvgs = async (result: CompilationResult) => {
        const loadToken = previewLoadTokenRef.current + 1;
        previewLoadTokenRef.current = loadToken;
        const started = now();

        let nextSvgs: string[];
        try {
            nextSvgs = await loadChangedPreviewSvgs(result, svgsRef.current);
        } catch (error: unknown) {
            if (isMountedRef.current && isNewerPreviewResult(result)) {
                setError(error instanceof Error ? error.message : String(error));
                if (
                    latestRevisionRef.current === null ||
                    result.source_revision >= latestRevisionRef.current
                ) {
                    setIsCompiling(false);
                }
            }
            return;
        }

        if (
            isMountedRef.current &&
            previewLoadTokenRef.current === loadToken &&
            isNewerPreviewResult(result)
        ) {
            setSvgs(nextSvgs);
            svgsRef.current = nextSvgs;
            setPreviewRevision(result.source_revision);
            previewRevisionRef.current = result.source_revision;
            setError(null);
            if (
                latestRevisionRef.current === null ||
                result.source_revision >= latestRevisionRef.current
            ) {
                setIsCompiling(false);
            }
            recordTiming("preview-svg-load", started);
        }
    };

    const applyPreviewResult = async (result: CompilationResult) => {
        if (!isNewerPreviewResult(result)) {
            return;
        }

        if (result.status === "succeeded") {
            setOutline(result.outline);
            setResources(result.resources);
            await loadPreviewSvgs(result);
            return;
        }

        if (result.status === "failed") {
            setError(result.diagnostics.join("\n") || "Compilation failed");
            if (
                latestRevisionRef.current === null ||
                result.source_revision >= latestRevisionRef.current
            ) {
                setIsCompiling(false);
            }
            return;
        }

        if (result.status === "dropped") {
            if (
                latestRevisionRef.current === null ||
                result.source_revision >= latestRevisionRef.current
            ) {
                setIsCompiling(false);
            }
        }
    };

    const applyImmediateSnapshot = async (jobRevision: SourceRevision) => {
        const snapshot = await TauriApi.getCompileStatus();
        if (
            snapshot.last_result &&
            snapshot.last_result.source_revision === jobRevision &&
            isMountedRef.current
        ) {
            await applyPreviewResult(snapshot.last_result);
        }
    };

    const enqueuePreview = async () => {
        const started = now();
        const job = await TauriApi.enqueuePreviewCompile(previewDebounceMsRef.current);
        recordTiming("preview-enqueue", started);
        latestRevisionRef.current = job.source_revision;
        await applyImmediateSnapshot(job.source_revision);
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

    const nextUnsyncedEvent = () =>
        desiredEventsRef.current.find(
            (event) => event.id > syncedEventIdRef.current,
        ) ?? null;

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
                    const syncStarted = now();
                    const status = await TauriApi.syncDocumentSnapshot(ast);
                    recordTiming("sync-snapshot", syncStarted);
                    if (
                        !isMountedRef.current ||
                        desiredSessionIdRef.current !== currentSessionId
                    ) {
                        continue;
                    }

                    bootstrappedSessionIdRef.current = currentSessionId;
                    syncedEventIdRef.current = 0;
                    setSourceMap(status.sourceMap);
                    await listenersReadyRef.current;
                    await enqueuePreview();
                    continue;
                }

                const nextEvent = nextUnsyncedEvent();
                if (!nextEvent) {
                    break;
                }

                recordDurationFromTimestamp("event-dispatch", nextEvent.timestamp);
                const syncStarted = now();
                const status = await TauriApi.syncDocumentEvent(nextEvent.event);
                recordTiming("sync-event", syncStarted);
                if (
                    !isMountedRef.current ||
                    desiredSessionIdRef.current !== currentSessionId
                ) {
                    continue;
                }

                syncedEventIdRef.current = nextEvent.id;
                ackDocumentEvents?.(nextEvent.id);
                setSourceMap(status.sourceMap);
                await listenersReadyRef.current;
                await enqueuePreview();
            }
        } catch (error: unknown) {
            if (isMountedRef.current) {
                syncFailedRef.current = true;
                failedEventCountRef.current = desiredEventsRef.current.length;
                setError(error instanceof Error ? error.message : String(error));
                setIsCompiling(false);
            }
        } finally {
            syncRunningRef.current = false;

            if (isMountedRef.current && !syncFailedRef.current && hasPendingSync()) {
                return syncLatestDocumentState();
            }
        }
    };

    const startDocumentSync = () => {
        if (syncRunningRef.current) {
            return;
        }

        const sync = listenersReadyRef.current.then(syncLatestDocumentState);
        setActiveDocumentSync(sync);
        void sync;
    };

    useCompileBridge({
        listenersReadyRef,
        onPreviewQueued: () => setIsCompiling(true),
        onPreviewResult: applyPreviewResult,
    });

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
            setSvgs([]);
            svgsRef.current = [];
            setSourceMap([]);
            setPreviewRevision(null);
            previewRevisionRef.current = null;
            setOutline(null);
            setResources(null);
            return;
        }

        const didSessionChange = desiredSessionIdRef.current !== sessionId;
        desiredAstRef.current = ast;
        desiredEventsRef.current = events;
        desiredSessionIdRef.current = sessionId;
        if (
            didSessionChange ||
            (syncFailedRef.current && events.length > failedEventCountRef.current)
        ) {
            syncFailedRef.current = false;
            if (didSessionChange) {
                setSvgs([]);
                svgsRef.current = [];
                setPreviewRevision(null);
                previewRevisionRef.current = null;
                latestRevisionRef.current = null;
                setOutline(null);
                setResources(null);
            }
        }

        setError(null);
        if (hasPendingSync()) {
            setIsCompiling(true);
            startDocumentSync();
        }
    }, [ackDocumentEvents, ast, events, sessionId]);

    return { svgs, isCompiling, error, sourceMap, previewRevision, outline, resources };
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
