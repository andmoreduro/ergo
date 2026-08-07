import {
    useEffect,
    useRef,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentOutline } from "../bindings/DocumentOutline";
import type { DocumentResources } from "../bindings/DocumentResources";
import type { PreviewPageFile } from "../bindings/PreviewPageFile";
import type { ProjectFile } from "../bindings/ProjectFile";
import type { SourceMapEntry } from "../bindings/SourceMapEntry";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import { TauriApi } from "../api/tauri";
import {
    documentAstForCompile,
    documentEventsForCompile,
} from "../settings/documentAstForCompile";
import { CompilerClient, loadDocumentFontsLazy } from "../workers/compilerClient";
import { projectFilesToVfsEntries } from "../workers/compilerProtocol";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import {
    registerBackendMirrorFlush,
    setActiveDocumentSync,
} from "./documentSyncBarrier";
import {
    elapsedMs,
    nowMs,
    type PendingPreviewTelemetry,
} from "./previewTelemetry";
import { getInputTimestamp } from "../perf/inputTimestamp";
import {
    resetBootstrapPhases,
    setBootstrapPhase,
} from "../perf/bootstrapPhases";

type SourceRevision = number;
type PackageDependency = { name: string; version: string };

const MITEX_PACKAGE: PackageDependency = {
    name: "@preview/mitex",
    version: "0.2.7",
};

export interface CompilerPreviewSetters {
    setPreviewPages: Dispatch<SetStateAction<PreviewPageFile[]>>;
    setIsCompiling: Dispatch<SetStateAction<boolean>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setSourceMap: Dispatch<SetStateAction<SourceMapEntry[]>>;
    setPreviewRevision: Dispatch<SetStateAction<SourceRevision | null>>;
    setOutline: Dispatch<SetStateAction<DocumentOutline | null>>;
    setResources: Dispatch<SetStateAction<DocumentResources | null>>;
    setPendingPreviewTelemetry: (
        telemetry: PendingPreviewTelemetry | null,
    ) => void;
    updateResourcePreviewRevisions: (status: DocumentSessionStatus) => void;
    resetPreviewRuntimeState: () => void;
    previewRevisionRef: MutableRefObject<SourceRevision | null>;
    latestRevisionRef: MutableRefObject<SourceRevision | null>;
    latencyStartRef: MutableRefObject<number | null>;
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

// The only optional Typst package is `mitex` (LaTeX-syntax equations). Its files
// are loaded unconditionally at bootstrap: present-but-unimported packages cost
// nothing to compile (the `#import` is only emitted when a LaTeX equation
// exists), and loading them once removes a per-keystroke whole-document scan from
// the sync hot path.

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
        setPendingPreviewTelemetry,
        updateResourcePreviewRevisions,
        resetPreviewRuntimeState,
        previewRevisionRef,
        latestRevisionRef,
        latencyStartRef,
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
    const loadedDependencyPackagesRef = useRef(new Set<string>());
    const backendMirrorDirtyRef = useRef(false);
    const isMountedRef = useRef(false);
    // Fingerprints of the last outline/resources applied, so a per-keystroke
    // compile that didn't alter headings or the resource catalog can skip the
    // setState that would otherwise bust every memoized Sidebar consumer. Body
    // typing changes the source map and the edited page, but not the outline
    // entries or the resource group list.
    const lastOutlineFingerprintRef = useRef<string>("");
    const lastResourcesGroupCountRef = useRef<number>(-1);

    const isNewerPreviewResult = (result: CompilationResult): boolean =>
        previewRevisionRef.current === null ||
        result.source_revision > previewRevisionRef.current;

    const applyPreviewResult = (
        status: DocumentSessionStatus,
        result: CompilationResult,
        forSessionId: number,
    ) => {
        if (desiredSessionIdRef.current !== forSessionId) {
            return;
        }
        if (!isNewerPreviewResult(result)) {
            return;
        }

        if (result.status === "succeeded") {
            latestRevisionRef.current = status.sourceRevision;
            previewRevisionRef.current = result.source_revision;
            updateResourcePreviewRevisions(status);
            setSourceMap(status.sourceMap);
            // Gate outline/resources on a cheap fingerprint: body typing
            // changes the source map and the edited page, but the heading list
            // and resource catalog are stable. Skipping the setState when the
            // fingerprint is unchanged avoids busting every memoized Sidebar
            // consumer (SidebarOutline.buildTargetedOutlineEntries,
            // SidebarResources) on every keystroke.
            const outline = result.outline;
            const entries = outline?.entries ?? [];
            const lastEntry = entries[entries.length - 1];
            const outlineFingerprint =
                entries.length > 0 && lastEntry
                    ? `${entries.length}:${lastEntry.text}:${lastEntry.page}`
                    : `${entries.length}:`;
            if (outlineFingerprint !== lastOutlineFingerprintRef.current) {
                lastOutlineFingerprintRef.current = outlineFingerprint;
                setOutline(outline);
            }
            if (result.resources) {
                const groupCount = result.resources.groups.length;
                if (groupCount !== lastResourcesGroupCountRef.current) {
                    lastResourcesGroupCountRef.current = groupCount;
                    setResources(result.resources);
                }
            }
            setPreviewPages(result.preview_pages || []);
            setPreviewRevision(result.source_revision);
            setError(null);
            if (
                latestRevisionRef.current === null ||
                result.source_revision >= latestRevisionRef.current
            ) {
                setIsCompiling(false);
            }
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
                    loadedDependencyPackagesRef.current = new Set();
                    resetBootstrapPhases();
                    const vfsFiles = [
                        ...projectFilesToVfsEntries(
                            desiredBootstrapFilesRef.current ?? [],
                        ),
                    ];

                    try {
                        const templateId = currentAst.metadata.template_id;
                        if (templateId) {
                            const tplStart = nowMs();
                            const templatePackageFiles =
                                await TauriApi.loadTemplatePackageFiles(templateId);
                            setBootstrapPhase(
                                "templatePackageLoadMs",
                                elapsedMs(tplStart, nowMs()),
                            );
                            vfsFiles.push(
                                ...projectFilesToVfsEntries(templatePackageFiles),
                            );
                        }
                        const mitexStart = nowMs();
                        const mitexFiles = await TauriApi.loadPackageFiles(
                            MITEX_PACKAGE.name,
                            MITEX_PACKAGE.version,
                        );
                        setBootstrapPhase(
                            "dependencyPackageLoadMs",
                            elapsedMs(mitexStart, nowMs()),
                        );
                        vfsFiles.push(...projectFilesToVfsEntries(mitexFiles));
                        loadedDependencyPackagesRef.current.add(
                            `${MITEX_PACKAGE.name}:${MITEX_PACKAGE.version}`,
                        );
                    } catch (loadError) {
                        console.error("Failed to load template package files:", loadError);
                    }

                    const astTransformStart = nowMs();
                    const compileAst = await documentAstForCompile(currentAst);
                    setBootstrapPhase(
                        "astTransformMs",
                        elapsedMs(astTransformStart, nowMs()),
                    );

                    const bootstrapStarted = nowMs();
                    const { status, result } = await CompilerClient.bootstrap({
                        ast: compileAst,
                        files: vfsFiles,
                    });
                    const bootstrapFinished = nowMs();
                    setBootstrapPhase(
                        "workerBootstrapMs",
                        elapsedMs(bootstrapStarted, bootstrapFinished),
                    );

                    if (
                        !isMountedRef.current ||
                        desiredSessionIdRef.current !== currentSessionId
                    ) {
                        continue;
                    }

                    bootstrappedSessionIdRef.current = currentSessionId;
                    syncedEventIdRef.current = 0;
                    if (result.status === "succeeded") {
                        setPendingPreviewTelemetry({
                            revision: result.source_revision,
                            startedAt: bootstrapStarted,
                            compileResultAt: bootstrapFinished,
                            queuedToSyncMs: 0,
                            workerSyncMs: 0,
                            compileMs: elapsedMs(
                                bootstrapStarted,
                                bootstrapFinished,
                            ),
                            inputAt: null,
                        });
                    }
                    applyPreviewResult(status, result, currentSessionId);

                    await TauriApi.syncDocumentSnapshot(compileAst);
                    backendMirrorDirtyRef.current = false;
                    continue;
                }

                const pendingEvents = desiredEventsRef.current.filter(
                    (event) => event.id > syncedEventIdRef.current,
                );
                if (pendingEvents.length === 0) {
                    break;
                }

                const lastEvent = pendingEvents[pendingEvents.length - 1];
                const syncStarted = nowMs();

                const compileEvents = await documentEventsForCompile(
                    pendingEvents.map((event) => event.event),
                );

                const status = await CompilerClient.syncEvents(compileEvents);

                const syncFinished = nowMs();
                if (
                    !isMountedRef.current ||
                    desiredSessionIdRef.current !== currentSessionId
                ) {
                    continue;
                }

                latencyStartRef.current = lastEvent.timestamp;

                // Keep compile metadata-only on the typing hot path. Visible changed
                // pages paint via `renderRegion` in PreviewPageCanvas (canvas
                // blits of worker-produced region bitmaps); inlining rendered
                // pages during compile (after forward scroll expands visible
                // indices) was adding raster work to every keystroke.
                //
                // Font loading is keyed + coalesced (no-op once the font set is
                // loaded for this session), but must precede compile so a mid-
                // session font change actually takes effect. It's explicit here
                // rather than hidden inside compile().
                await loadDocumentFontsLazy(currentAst);
                const compileOutput = await CompilerClient.compile([]);
                const compileFinished = nowMs();
                setPendingPreviewTelemetry({
                    revision: compileOutput.result.source_revision,
                    startedAt: lastEvent.timestamp,
                    compileResultAt: compileFinished,
                    queuedToSyncMs: elapsedMs(lastEvent.timestamp, syncStarted),
                    workerSyncMs: elapsedMs(syncStarted, syncFinished),
                    compileMs: compileOutput.compileMs,
                    // Capture at the moment this batch's events were queued for
                    // the worker: the most recent input timestamp (if any)
                    // precedes `lastEvent.timestamp` by the input-pipeline cost.
                    inputAt: getInputTimestamp(),
                });
                applyPreviewResult(status, compileOutput.result, currentSessionId);

                backendMirrorDirtyRef.current = true;

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
        const flushBackendMirror = async () => {
            if (!backendMirrorDirtyRef.current) {
                return;
            }
            const mirrorAst = desiredAstRef.current;
            const mirrorSessionId = desiredSessionIdRef.current;
            if (
                mirrorAst === null ||
                bootstrappedSessionIdRef.current !== mirrorSessionId
            ) {
                return;
            }
            await TauriApi.syncDocumentSnapshot(
                await documentAstForCompile(mirrorAst),
            );
            backendMirrorDirtyRef.current = false;
        };

        registerBackendMirrorFlush(flushBackendMirror);
        return () => registerBackendMirrorFlush(null);
    }, []);

    useEffect(() => {
        if (!ast) {
            desiredAstRef.current = null;
            desiredEventsRef.current = [];
            desiredBootstrapFilesRef.current = null;
            backendMirrorDirtyRef.current = false;
            setPreviewPages([]);
            setSourceMap([]);
            setPreviewRevision(null);
            previewRevisionRef.current = null;
            setOutline(null);
            setResources(null);
            lastOutlineFingerprintRef.current = "";
            lastResourcesGroupCountRef.current = -1;
            latencyStartRef.current = null;
            resetPreviewRuntimeState();
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
                backendMirrorDirtyRef.current = false;
                bootstrappedSessionIdRef.current = null;
                setPreviewPages([]);
                setPreviewRevision(null);
                previewRevisionRef.current = null;
                latestRevisionRef.current = null;
                setOutline(null);
                setResources(null);
                lastOutlineFingerprintRef.current = "";
                lastResourcesGroupCountRef.current = -1;
                latencyStartRef.current = null;
                resetPreviewRuntimeState();
            }
        }

        setError(null);
        if (hasPendingSync()) {
            setIsCompiling(true);
            startDocumentSync();
        }
    }, [ackDocumentEvents, sessionId, eventsVersion, bootstrapFiles]);
}
