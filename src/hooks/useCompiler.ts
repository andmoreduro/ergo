import { useState, useEffect, useRef } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import { TauriApi } from "../api/tauri";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { SourceMapEntry } from "../bindings/SourceMapEntry";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import { setActiveDocumentSync } from "./documentSyncBarrier";
import { useCompileBridge } from "./useCompileBridge";
import { loadChangedPreviewSvgs } from "./useSvgLoader";

type SourceRevision = number;

interface UseCompilerResult {
    svgs: string[];
    isCompiling: boolean;
    error: string | null;
    sourceMap: SourceMapEntry[];
    previewRevision: SourceRevision | null;
}

export function useCompiler(
    ast: DocumentAST | null | undefined,
    events: QueuedDocumentEvent[] = [],
    sessionId = 1,
    previewDebounceMs = 0,
): UseCompilerResult {
    const [svgs, setSvgs] = useState<string[]>([]);
    const [isCompiling, setIsCompiling] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceMap, setSourceMap] = useState<SourceMapEntry[]>([]);
    const [previewRevision, setPreviewRevision] = useState<SourceRevision | null>(null);
    const desiredAstRef = useRef<DocumentAST | null>(null);
    const desiredEventsRef = useRef<QueuedDocumentEvent[]>([]);
    const desiredSessionIdRef = useRef(sessionId);
    const bootstrappedSessionIdRef = useRef<number | null>(null);
    const syncedEventIdRef = useRef(0);
    const latestRevisionRef = useRef<SourceRevision | null>(null);
    const listenersReadyRef = useRef<Promise<void>>(Promise.resolve());
    const syncRunningRef = useRef(false);
    const syncFailedRef = useRef(false);
    const isMountedRef = useRef(false);
    const previewLoadTokenRef = useRef(0);
    const svgsRef = useRef<string[]>([]);
    const previewDebounceMsRef = useRef(previewDebounceMs);
    previewDebounceMsRef.current = previewDebounceMs;

    const isLatestPreviewResult = (result: CompilationResult): boolean => {
        return (
            result.kind.type === "previewSvg" &&
            result.source_revision === latestRevisionRef.current
        );
    };

    const loadPreviewSvgs = async (result: CompilationResult) => {
        const loadToken = previewLoadTokenRef.current + 1;
        previewLoadTokenRef.current = loadToken;

        let nextSvgs: string[];
        try {
            nextSvgs = await loadChangedPreviewSvgs(result, svgsRef.current);
        } catch (error: unknown) {
            if (isMountedRef.current && isLatestPreviewResult(result)) {
                setError(error instanceof Error ? error.message : String(error));
                setIsCompiling(false);
            }
            return;
        }

        if (
            isMountedRef.current &&
            previewLoadTokenRef.current === loadToken &&
            isLatestPreviewResult(result)
        ) {
            setSvgs(nextSvgs);
            svgsRef.current = nextSvgs;
            setPreviewRevision(result.source_revision);
            setError(null);
            setIsCompiling(false);
        }
    };

    const applyPreviewResult = async (result: CompilationResult) => {
        if (!isLatestPreviewResult(result)) {
            return;
        }

        if (result.status === "succeeded") {
            await loadPreviewSvgs(result);
            return;
        }

        if (result.status === "failed") {
            setError(result.diagnostics.join("\n") || "Compilation failed");
            setIsCompiling(false);
            return;
        }

        if (result.status === "dropped") {
            setIsCompiling(false);
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
        const job = await TauriApi.enqueuePreviewCompile(previewDebounceMsRef.current);
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
                    const status = await TauriApi.syncDocumentSnapshot(ast);
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

                const status = await TauriApi.syncDocumentEvent(nextEvent.event);
                if (
                    !isMountedRef.current ||
                    desiredSessionIdRef.current !== currentSessionId
                ) {
                    continue;
                }

                syncedEventIdRef.current = nextEvent.id;
                setSourceMap(status.sourceMap);
                await listenersReadyRef.current;
                await enqueuePreview();
            }
        } catch (error: unknown) {
            if (isMountedRef.current) {
                syncFailedRef.current = true;
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
            return;
        }

        const didSessionChange = desiredSessionIdRef.current !== sessionId;
        desiredAstRef.current = ast;
        desiredEventsRef.current = events;
        desiredSessionIdRef.current = sessionId;
        if (didSessionChange) {
            syncFailedRef.current = false;
        }

        setError(null);
        if (hasPendingSync()) {
            setIsCompiling(true);
            startDocumentSync();
        }
    }, [ast, events, sessionId]);

    return { svgs, isCompiling, error, sourceMap, previewRevision };
}
