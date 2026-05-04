import { useState, useEffect, useRef } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import { TauriApi } from "../api/tauri";
import type { CompilationResult, SourceRevision } from "../types/compilation";
import type { SourceMapEntry } from "../types/sourceMap";

interface UseCompilerResult {
    svgs: string[];
    isCompiling: boolean;
    error: string | null;
    sourceMap: SourceMapEntry[];
}

interface TextPatch {
    start: number;
    end: number;
    text: string;
}

export const createTextPatch = (previous: string, next: string): TextPatch | null => {
    if (previous === next) {
        return null;
    }

    const previousChars = Array.from(previous);
    const nextChars = Array.from(next);
    let start = 0;

    while (
        start < previousChars.length &&
        start < nextChars.length &&
        previousChars[start] === nextChars[start]
    ) {
        start += 1;
    }

    let previousEnd = previousChars.length;
    let nextEnd = nextChars.length;

    while (
        previousEnd > start &&
        nextEnd > start &&
        previousChars[previousEnd - 1] === nextChars[nextEnd - 1]
    ) {
        previousEnd -= 1;
        nextEnd -= 1;
    }

    return {
        start,
        end: previousEnd,
        text: nextChars.slice(start, nextEnd).join(""),
    };
};

export function useCompiler(ast: DocumentAST | null | undefined): UseCompilerResult {
    const [svgs, setSvgs] = useState<string[]>([]);
    const [isCompiling, setIsCompiling] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [sourceMap, setSourceMap] = useState<SourceMapEntry[]>([]);
    const desiredAstRef = useRef<DocumentAST | null>(null);
    const desiredTokenRef = useRef(0);
    const syncedTokenRef = useRef(0);
    const latestRevisionRef = useRef<SourceRevision | null>(null);
    const listenersReadyRef = useRef<Promise<void>>(Promise.resolve());
    const syncRunningRef = useRef(false);
    const isMountedRef = useRef(false);
    const previewLoadTokenRef = useRef(0);

    const isLatestPreviewResult = (result: CompilationResult): boolean => {
        return (
            result.kind.type === "previewSvg" &&
            result.source_revision === latestRevisionRef.current
        );
    };

    const loadPreviewSvgs = async (result: CompilationResult) => {
        const loadToken = previewLoadTokenRef.current + 1;
        previewLoadTokenRef.current = loadToken;

        const previewPages = result.preview_pages ?? [];
        let nextSvgs: string[];
        try {
            nextSvgs =
                previewPages.length > 0
                    ? await Promise.all(
                          previewPages.map((page) => TauriApi.readPreviewSvg(page.path)),
                      )
                    : result.svgs ?? [];
        } catch (error: unknown) {
            if (result.svgs?.length) {
                nextSvgs = result.svgs;
            } else {
                if (isMountedRef.current && isLatestPreviewResult(result)) {
                    setError(error instanceof Error ? error.message : String(error));
                    setIsCompiling(false);
                }
                return;
            }
        }

        if (
            isMountedRef.current &&
            previewLoadTokenRef.current === loadToken &&
            isLatestPreviewResult(result)
        ) {
            setSvgs(nextSvgs);
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
        const job = await TauriApi.enqueuePreviewCompile();
        latestRevisionRef.current = job.source_revision;
        await applyImmediateSnapshot(job.source_revision);
    };

    const syncLatestSnapshot = async () => {
        if (syncRunningRef.current) {
            return;
        }

        syncRunningRef.current = true;

        try {
            while (isMountedRef.current) {
                const ast = desiredAstRef.current;
                const token = desiredTokenRef.current;
                if (ast === null || token === syncedTokenRef.current) {
                    break;
                }

                const status = await TauriApi.syncDocumentSnapshot(ast);
                if (desiredTokenRef.current === token && desiredAstRef.current === ast) {
                    syncedTokenRef.current = token;
                    setSourceMap(status.sourceMap);
                    await listenersReadyRef.current;
                    await enqueuePreview();
                }
            }
        } catch (error: unknown) {
            if (isMountedRef.current) {
                setError(error instanceof Error ? error.message : String(error));
                setIsCompiling(false);
            }
        } finally {
            syncRunningRef.current = false;

            if (
                isMountedRef.current &&
                desiredTokenRef.current !== syncedTokenRef.current
            ) {
                void syncLatestSnapshot();
            }
        }
    };

    useEffect(() => {
        let isMounted = true;
        isMountedRef.current = true;
        let unlisten: (() => void) | null = null;

        listenersReadyRef.current = TauriApi.listenToCompileEvents({
            onQueued: (result) => {
                if (isMounted && result.kind.type === "previewSvg") {
                    setIsCompiling(true);
                }
            },
            onStarted: (result) => {
                if (isMounted && result.kind.type === "previewSvg") {
                    setIsCompiling(true);
                }
            },
            onSucceeded: (result) => {
                if (!isMounted) {
                    return;
                }

                void applyPreviewResult(result);
            },
            onFailed: (result) => {
                if (!isMounted) {
                    return;
                }

                void applyPreviewResult(result);
            },
            onDropped: (result) => {
                if (isMounted) {
                    void applyPreviewResult(result);
                }
            },
        }).then((nextUnlisten) => {
            if (isMounted) {
                unlisten = nextUnlisten;
            } else {
                nextUnlisten?.();
            }
        }).catch(() => {
            unlisten = null;
        });

        return () => {
            isMounted = false;
            isMountedRef.current = false;
            unlisten?.();
        };
    }, []);

    useEffect(() => {
        if (!ast) {
            desiredAstRef.current = null;
            setSvgs([]);
            setSourceMap([]);
            return;
        }

        desiredAstRef.current = ast;
        desiredTokenRef.current += 1;
        setIsCompiling(true);
        setError(null);
        void listenersReadyRef.current.then(syncLatestSnapshot);
    }, [ast]);

    return { svgs, isCompiling, error, sourceMap };
}
