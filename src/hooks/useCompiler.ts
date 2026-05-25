import { useRef, useState } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { ProjectFile } from "../bindings/ProjectFile";
import type { SourceMapEntry } from "../bindings/SourceMapEntry";
import type { QueuedDocumentEvent } from "../state/DocumentContext";
import type { DocumentOutline } from "../bindings/DocumentOutline";
import type { DocumentResources } from "../bindings/DocumentResources";
import type { PreviewPageFile } from "../bindings/PreviewPageFile";
import { useDocumentCompilerSync } from "./useDocumentCompilerSync";

type SourceRevision = number;

export interface UseCompilerResult {
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
    const [isCompiling, setIsCompiling] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceMap, setSourceMap] = useState<SourceMapEntry[]>([]);
    const [previewRevision, setPreviewRevision] = useState<SourceRevision | null>(null);
    const [outline, setOutline] = useState<DocumentOutline | null>(null);
    const [resources, setResources] = useState<DocumentResources | null>(null);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);

    const previewRevisionRef = useRef<SourceRevision | null>(null);
    const latestRevisionRef = useRef<SourceRevision | null>(null);
    const inputLatencyStartRef = useRef<number | null>(null);

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
            setLatencyMs,
            previewRevisionRef,
            latestRevisionRef,
            inputLatencyStartRef,
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
        latencyMs,
    };
}
