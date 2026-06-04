import {
    useCallback,
    useMemo,
    useRef,
    useState,
    type MutableRefObject,
} from "react";
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
    type PagePaintInfo,
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
    previewSvgPageIndicesRef: MutableRefObject<number[]>;
    previewTelemetry: PreviewTelemetry | null;
    resourcePreviewRevisions: ResourcePreviewRevisions;
    mainPreviewPaintedRevision: SourceRevision | null;
    markMainPreviewPainted: (
        revision: SourceRevision,
        paintInfo?: PagePaintInfo,
    ) => void;
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
    // Default to the first page so the very first compile/bootstrap inlines it;
    // the Preview keeps this in sync with the pages actually on screen.
    const previewSvgPageIndicesRef = useRef<number[]>([0]);
    const pendingPreviewTelemetryRef = useRef<PendingPreviewTelemetry | null>(null);
    // Revision whose telemetry was finalized by a page that actually re-rendered
    // (authoritative, locked), and the revision provisionally finalized by a
    // no-render page. Both prevent re-finalizing the same revision repeatedly
    // (e.g. when a page re-paints on scroll), which would inflate `render`.
    const renderedTelemetryRevisionRef = useRef<SourceRevision | null>(null);
    const noRenderTelemetryRevisionRef = useRef<SourceRevision | null>(null);

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
        renderedTelemetryRevisionRef.current = null;
        noRenderTelemetryRevisionRef.current = null;
        previewSvgPageIndicesRef.current = [0];
        setPreviewTelemetry(null);
        setResourcePreviewRevisions({});
        setMainPreviewPaintedRevision(null);
    }, []);

    const markMainPreviewPainted = useCallback(
        (revision: SourceRevision, paintInfo?: PagePaintInfo) => {
            setMainPreviewPaintedRevision((current) =>
                current === null || revision > current ? revision : current,
            );

            const pendingTelemetry = pendingPreviewTelemetryRef.current;
            if (!pendingTelemetry || pendingTelemetry.revision !== revision) {
                return;
            }
            // Finalize at most once per revision: a no-render page records a
            // provisional reading (so the overlay shows), and a page that actually
            // re-rendered may upgrade it once with authoritative worker/dom timing.
            // Both are then locked so repeat paints (scroll, re-render) don't
            // re-finalize and inflate `render`.
            const rendered = paintInfo?.renderedThisRevision ?? true;
            if (renderedTelemetryRevisionRef.current === revision) {
                return;
            }
            if (!rendered && noRenderTelemetryRevisionRef.current === revision) {
                return;
            }

            const paintedAt = nowMs();
            const domWrittenAt = paintInfo?.domWrittenAt ?? paintedAt;
            setPreviewTelemetry({
                totalLatencyMs: elapsedMs(pendingTelemetry.startedAt, paintedAt),
                queuedToSyncMs: pendingTelemetry.queuedToSyncMs,
                workerSyncMs: pendingTelemetry.workerSyncMs,
                compileMs: pendingTelemetry.compileMs,
                svgRenderMs: elapsedMs(
                    pendingTelemetry.compileResultAt,
                    domWrittenAt,
                ),
                scheduleMs: elapsedMs(
                    pendingTelemetry.compileResultAt,
                    paintInfo?.effectStartAt ?? domWrittenAt,
                ),
                workerRenderMs: paintInfo?.workerRenderMs ?? 0,
                domWriteMs: paintInfo?.domWriteMs ?? 0,
                rasterMs: elapsedMs(domWrittenAt, paintedAt),
            });
            if (rendered) {
                renderedTelemetryRevisionRef.current = revision;
                pendingPreviewTelemetryRef.current = null;
                latencyStartRef.current = null;
            } else {
                noRenderTelemetryRevisionRef.current = revision;
            }
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
            previewSvgPageIndicesRef,
        },
    });

    // Memoized so the object identity is stable between keystrokes (its fields
    // only change when a compile completes). This lets pure-props consumers such
    // as the memoized Sidebar skip re-rendering while the user types.
    return useMemo(
        () => ({
            previewPages,
            isCompiling,
            error,
            sourceMap,
            previewRevision,
            outline,
            resources,
            latencyStartRef,
            previewSvgPageIndicesRef,
            previewTelemetry,
            resourcePreviewRevisions,
            mainPreviewPaintedRevision,
            markMainPreviewPainted,
        }),
        [
            previewPages,
            isCompiling,
            error,
            sourceMap,
            previewRevision,
            outline,
            resources,
            latencyStartRef,
            previewSvgPageIndicesRef,
            previewTelemetry,
            resourcePreviewRevisions,
            mainPreviewPaintedRevision,
            markMainPreviewPainted,
        ],
    );
}
