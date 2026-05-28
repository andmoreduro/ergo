import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentOutline } from "../bindings/DocumentOutline";
import type { DocumentResources } from "../bindings/DocumentResources";
import type { PreviewPageFile } from "../bindings/PreviewPageFile";
import type { ProjectFile } from "../bindings/ProjectFile";
import type { SourceMapEntry } from "../bindings/SourceMapEntry";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import { TauriApi } from "../api/tauri";
import { CompilerClient } from "../workers/compilerClient";
import { projectFilesToVfsEntries } from "../workers/compilerProtocol";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import { setActiveDocumentSync } from "./documentSyncBarrier";
import {
    elapsedMs,
    nowMs,
    type PendingPreviewTelemetry,
} from "./previewTelemetry";

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

const richTextUsesLatex = (
    content: Array<{ kind: string | null; equation_syntax?: string }>,
): boolean =>
    content.some(
        (span) =>
            span.kind === "inlineEquation" && span.equation_syntax === "latex",
    );

const astUsesLatexEquations = (ast: DocumentAST): boolean =>
    ast.sections.some((section) => {
        if (section.type !== "Content") {
            return false;
        }

        return section.elements.some((element) => {
            switch (element.type) {
                case "Heading":
                case "Paragraph":
                case "Quote":
                    return richTextUsesLatex(element.content);
                case "List":
                case "Enumeration":
                    return element.items.some(richTextUsesLatex);
                case "Equation":
                    return element.syntax === "latex";
                case "Figure":
                    return element.content.type === "Paragraph"
                        ? richTextUsesLatex(element.content.content)
                        : false;
                default:
                    return false;
            }
        });
    });

const requiredPackagesForAst = (ast: DocumentAST): PackageDependency[] =>
    astUsesLatexEquations(ast) ? [MITEX_PACKAGE] : [];

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
    const isMountedRef = useRef(false);

    const isNewerPreviewResult = (result: CompilationResult): boolean =>
        previewRevisionRef.current === null ||
        result.source_revision > previewRevisionRef.current;

    const applyPreviewResult = (
        status: DocumentSessionStatus,
        result: CompilationResult,
    ) => {
        if (!isNewerPreviewResult(result)) {
            return;
        }

        if (result.status === "succeeded") {
            latestRevisionRef.current = status.sourceRevision;
            updateResourcePreviewRevisions(status);
            setSourceMap(status.sourceMap);
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
                    loadedDependencyPackagesRef.current = new Set();
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
                        for (const dependency of requiredPackagesForAst(currentAst)) {
                            const packageFiles = await TauriApi.loadPackageFiles(
                                dependency.name,
                                dependency.version,
                            );
                            vfsFiles.push(...projectFilesToVfsEntries(packageFiles));
                            loadedDependencyPackagesRef.current.add(
                                `${dependency.name}:${dependency.version}`,
                            );
                        }
                    } catch (loadError) {
                        console.error("Failed to load template package files:", loadError);
                    }

                    const bootstrapStarted = nowMs();
                    const { status, result } = await CompilerClient.bootstrap({
                        ast: currentAst,
                        files: vfsFiles,
                    });
                    const bootstrapFinished = nowMs();

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
                        });
                    }
                    applyPreviewResult(status, result);

                    await mirrorToBackend(currentAst, [], true);
                    continue;
                }

                const missingDependencies = requiredPackagesForAst(currentAst).filter(
                    (dependency) =>
                        !loadedDependencyPackagesRef.current.has(
                            `${dependency.name}:${dependency.version}`,
                        ),
                );
                if (missingDependencies.length > 0) {
                    const dependencyFiles: ProjectFile[] = [];
                    for (const dependency of missingDependencies) {
                        dependencyFiles.push(
                            ...(await TauriApi.loadPackageFiles(
                                dependency.name,
                                dependency.version,
                            )),
                        );
                        loadedDependencyPackagesRef.current.add(
                            `${dependency.name}:${dependency.version}`,
                        );
                    }
                    await CompilerClient.writeFiles(
                        projectFilesToVfsEntries(dependencyFiles),
                    );
                }

                const pendingEvents = desiredEventsRef.current.filter(
                    (event) => event.id > syncedEventIdRef.current,
                );
                if (pendingEvents.length === 0) {
                    break;
                }

                const lastEvent = pendingEvents[pendingEvents.length - 1];
                const syncStarted = nowMs();

                const status = await CompilerClient.syncEvents(
                    currentAst,
                    pendingEvents.map((event) => event.event),
                );

                const syncFinished = nowMs();
                if (
                    !isMountedRef.current ||
                    desiredSessionIdRef.current !== currentSessionId
                ) {
                    continue;
                }

                latencyStartRef.current = lastEvent.timestamp;

                const mirrorPromise = mirrorToBackend(
                    currentAst,
                    pendingEvents,
                    false,
                );

                const compileStarted = nowMs();
                const result = await CompilerClient.compile(currentAst);
                const compileFinished = nowMs();
                setPendingPreviewTelemetry({
                    revision: result.source_revision,
                    startedAt: lastEvent.timestamp,
                    compileResultAt: compileFinished,
                    queuedToSyncMs: elapsedMs(lastEvent.timestamp, syncStarted),
                    workerSyncMs: elapsedMs(syncStarted, syncFinished),
                    compileMs: elapsedMs(compileStarted, compileFinished),
                });
                applyPreviewResult(status, result);

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
                setPreviewPages([]);
                setPreviewRevision(null);
                previewRevisionRef.current = null;
                latestRevisionRef.current = null;
                setOutline(null);
                setResources(null);
                latencyStartRef.current = null;
                resetPreviewRuntimeState();
            }
        }

        setError(null);
        if (hasPendingSync()) {
            setIsCompiling(true);
            startDocumentSync();
        }
    }, [ackDocumentEvents, ast, sessionId, eventsVersion, bootstrapFiles]);
}
