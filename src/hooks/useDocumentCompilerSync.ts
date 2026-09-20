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
import { outlineEqual, resourcesEqual } from "./compileResultEquality";
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
    setError: Dispatch<SetStateAction<string | null>>;
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
        setError,
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
    // AST object last mirrored into the Tauri backend session (what
    // `save_project` persists). Compared by identity against the latest
    // committed AST, so the mirror is flushed whenever the document changed,
    // whether or not the worker sync that followed succeeded.
    const mirroredAstRef = useRef<DocumentAST | null>(null);
    const isMountedRef = useRef(false);
    // Last outline/resources applied, so a per-keystroke compile that didn't
    // alter headings or the resource catalog can skip the setState that would
    // otherwise bust every memoized Sidebar consumer. Compared structurally
    // (not by a partial fingerprint) so a renamed heading, a shifted page
    // number, or a new resource inside an existing group still propagates.
    const lastOutlineRef = useRef<DocumentOutline | null>(null);
    const lastResourcesRef = useRef<DocumentResources | null>(null);

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
            // Body typing changes the source map and the edited page, but the
            // heading list and resource catalog are usually stable. Skipping the
            // setState when the content is unchanged keeps the memoized Sidebar
            // consumers (outline list, resource thumbnails) from re-rendering
            // on every keystroke.
            const outline = result.outline;
            if (!outlineEqual(lastOutlineRef.current, outline)) {
                lastOutlineRef.current = outline;
                setOutline(outline);
            }
            if (
                result.resources &&
                !resourcesEqual(lastResourcesRef.current, result.resources)
            ) {
                lastResourcesRef.current = result.resources;
                setResources(result.resources);
            }
            setPreviewPages(result.preview_pages || []);
            setPreviewRevision(result.source_revision);
            setError(null);
        } else if (result.status === "failed") {
            setError(result.diagnostics.join("\n") || "Compilation failed");
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
                // Events already folded into `currentAst`; a bootstrap snapshot
                // carries them, so they must not be replayed afterwards (a
                // replayed insert would duplicate the element in the preview).
                const currentEvents = desiredEventsRef.current;
                const includedUpToEventId =
                    currentEvents[currentEvents.length - 1]?.id ?? 0;

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
                        // The template-package and dependency-package loads are
                        // independent IPC round-trips; run them in parallel
                        // rather than sequentially. On the medium project this
                        // collapses ~860ms of serial IPC into the slower of the
                        // two (~730ms template load).
                        const pkgStart = nowMs();
                        const [templatePackageFiles, mitexFiles] = await Promise.all([
                            templateId
                                ? TauriApi.loadTemplatePackageFiles(templateId)
                                : Promise.resolve([]),
                            TauriApi.loadPackageFiles(
                                MITEX_PACKAGE.name,
                                MITEX_PACKAGE.version,
                            ),
                        ]);
                        setBootstrapPhase(
                            "templatePackageLoadMs",
                            elapsedMs(pkgStart, nowMs()),
                        );
                        // Record the dependency load as its own phase (it ran
                        // concurrently; its isolated cost is hidden inside the
                        // parallel window, but logging it preserves the field
                        // for cases where the template load is absent).
                        setBootstrapPhase(
                            "dependencyPackageLoadMs",
                            elapsedMs(pkgStart, nowMs()),
                        );
                        vfsFiles.push(
                            ...projectFilesToVfsEntries(templatePackageFiles),
                        );
                        vfsFiles.push(...projectFilesToVfsEntries(mitexFiles));
                        loadedDependencyPackagesRef.current.add(
                            `${MITEX_PACKAGE.name}:${MITEX_PACKAGE.version}`,
                        );
                    } catch (loadError) {
                        console.error("Failed to load package files:", loadError);
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
                    syncedEventIdRef.current = includedUpToEventId;
                    if (includedUpToEventId > 0) {
                        ackDocumentEvents?.(includedUpToEventId);
                    }
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
                    mirroredAstRef.current = currentAst;
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
        const flushBackendMirror = async (): Promise<DocumentAST | null> => {
            const mirrorAst = desiredAstRef.current;
            if (mirrorAst === null) {
                return null;
            }
            if (mirroredAstRef.current === mirrorAst) {
                return mirrorAst;
            }
            // The backend session is independent of the worker: mirror whenever
            // the committed AST moved past what the backend holds, even if the
            // worker bootstrap/sync failed, so a save never persists a stale
            // document.
            await TauriApi.syncDocumentSnapshot(
                await documentAstForCompile(mirrorAst),
            );
            mirroredAstRef.current = mirrorAst;
            return mirrorAst;
        };

        registerBackendMirrorFlush(flushBackendMirror);
        return () => registerBackendMirrorFlush(null);
    }, []);

    useEffect(() => {
        if (!ast) {
            desiredAstRef.current = null;
            desiredEventsRef.current = [];
            desiredBootstrapFilesRef.current = null;
            mirroredAstRef.current = null;
            setPreviewPages([]);
            setPreviewRevision(null);
            previewRevisionRef.current = null;
            setOutline(null);
            setResources(null);
            lastOutlineRef.current = null;
            lastResourcesRef.current = null;
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
                // Unknown until the bootstrap (or a save) mirrors the loaded AST.
                mirroredAstRef.current = null;
                bootstrappedSessionIdRef.current = null;
                setPreviewPages([]);
                setPreviewRevision(null);
                previewRevisionRef.current = null;
                latestRevisionRef.current = null;
                setOutline(null);
                setResources(null);
                lastOutlineRef.current = null;
                lastResourcesRef.current = null;
                latencyStartRef.current = null;
                resetPreviewRuntimeState();
            }
        }

        setError(null);
        if (hasPendingSync()) {
            startDocumentSync();
        }
    }, [ackDocumentEvents, sessionId, eventsVersion, bootstrapFiles]);
}
