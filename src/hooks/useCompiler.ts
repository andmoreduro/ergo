import { useCallback, useRef, useState, type MutableRefObject } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentSessionStatus } from "../bindings/DocumentSessionStatus";
import type { ProjectFile } from "../bindings/ProjectFile";
import type { SourceMapEntry } from "../bindings/SourceMapEntry";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import type { DocumentOutline } from "../bindings/DocumentOutline";
import type { DocumentResources } from "../bindings/DocumentResources";
import type { PreviewPageFile } from "../bindings/PreviewPageFile";
import { useDocumentCompilerSync } from "./useDocumentCompilerSync";
import {
    elapsedMs,
    nowMs,
    type PendingPreviewTelemetry,
    type PreviewTelemetry,
} from "./previewTelemetry";

type SourceRevision = number;
export type ResourcePreviewRevisions = Record<string, SourceRevision>;

export interface UseCompilerResult {
    previewPages: PreviewPageFile[];
    isCompiling: boolean;
    error: string | null;
    sourceMap: SourceMapEntry[];
    previewRevision: SourceRevision | null;
    outline: DocumentOutline | null;
    resources: DocumentResources | null;
    latencyStartRef: MutableRefObject<number | null>;
    previewTelemetry: PreviewTelemetry | null;
    resourcePreviewRevisions: ResourcePreviewRevisions;
    mainPreviewPaintedRevision: SourceRevision | null;
    markMainPreviewPainted: (revision: SourceRevision) => void;
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
    const [isCompiling, setIsCompiling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceMap, setSourceMap] = useState<SourceMapEntry[]>([]);
    const [previewRevision, setPreviewRevision] = useState<SourceRevision | null>(null);
    const [outline, setOutline] = useState<DocumentOutline | null>(null);
    const [resources, setResources] = useState<DocumentResources | null>(null);
    const [previewTelemetry, setPreviewTelemetry] =
        useState<PreviewTelemetry | null>(null);
    const [resourcePreviewRevisions, setResourcePreviewRevisions] =
        useState<ResourcePreviewRevisions>({});
    const [mainPreviewPaintedRevision, setMainPreviewPaintedRevision] =
        useState<SourceRevision | null>(null);

    const previewRevisionRef = useRef<SourceRevision | null>(null);
    const latestRevisionRef = useRef<SourceRevision | null>(null);
    const latencyStartRef = useRef<number | null>(null);
    const pendingPreviewTelemetryRef = useRef<PendingPreviewTelemetry | null>(null);

    const setPendingPreviewTelemetry = useCallback(
        (telemetry: PendingPreviewTelemetry | null) => {
            pendingPreviewTelemetryRef.current = telemetry;
            if (telemetry) {
                setPreviewTelemetry(null);
            }
        },
        [],
    );

    const updateResourcePreviewRevisions = useCallback(
        (status: DocumentSessionStatus) => {
            if (status.dirtyResourceIds.length === 0) {
                return;
            }

            setResourcePreviewRevisions((current) => {
                let didChange = false;
                const next = { ...current };
                for (const resourceId of status.dirtyResourceIds) {
                    if (next[resourceId] !== status.sourceRevision) {
                        next[resourceId] = status.sourceRevision;
                        didChange = true;
                    }
                }
                return didChange ? next : current;
            });
        },
        [],
    );

    const resetPreviewRuntimeState = useCallback(() => {
        pendingPreviewTelemetryRef.current = null;
        setPreviewTelemetry(null);
        setResourcePreviewRevisions({});
        setMainPreviewPaintedRevision(null);
    }, []);

    const markMainPreviewPainted = useCallback(
        (revision: SourceRevision) => {
            setMainPreviewPaintedRevision((current) =>
                current === null || revision > current ? revision : current,
            );

            const pendingTelemetry = pendingPreviewTelemetryRef.current;
            if (!pendingTelemetry || pendingTelemetry.revision !== revision) {
                return;
            }

            const paintedAt = nowMs();
            setPreviewTelemetry({
                totalLatencyMs: elapsedMs(pendingTelemetry.startedAt, paintedAt),
                queuedToSyncMs: pendingTelemetry.queuedToSyncMs,
                workerSyncMs: pendingTelemetry.workerSyncMs,
                compileMs: pendingTelemetry.compileMs,
                paintMs: elapsedMs(pendingTelemetry.compileResultAt, paintedAt),
            });
            pendingPreviewTelemetryRef.current = null;
            latencyStartRef.current = null;
        },
        [],
    );

    useDocumentCompilerSync({
        ast,
        events,
        sessionId,
        ackDocumentEvents,
        eventsVersion,
        bootstrapFiles,
        preview: {
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
        },
    });

    return {
        previewPages,
        isCompiling,
        error,
        sourceMap,
        previewRevision,
        outline,
        resources,
        latencyStartRef,
        previewTelemetry,
        resourcePreviewRevisions,
        mainPreviewPaintedRevision,
        markMainPreviewPainted,
    };
}
