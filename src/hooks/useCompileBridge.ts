import { useEffect, useRef, type MutableRefObject } from "react";

import { TauriApi } from "../api/tauri";
import type { CompilationResult } from "../bindings/CompilationResult";

interface UseCompileBridgeOptions {
    listenersReadyRef: MutableRefObject<Promise<void>>;
    onPreviewQueued: () => void;
    onPreviewResult: (result: CompilationResult) => void | Promise<void>;
}

export const useCompileBridge = ({
    listenersReadyRef,
    onPreviewQueued,
    onPreviewResult,
}: UseCompileBridgeOptions) => {
    const onPreviewQueuedRef = useRef(onPreviewQueued);
    onPreviewQueuedRef.current = onPreviewQueued;
    const onPreviewResultRef = useRef(onPreviewResult);
    onPreviewResultRef.current = onPreviewResult;

    useEffect(() => {
        let isMounted = true;
        let unlisten: (() => void) | null = null;

        const applyResult = (result: CompilationResult) => {
            if (isMounted) {
                void onPreviewResultRef.current(result);
            }
        };

        const markQueued = (result: CompilationResult) => {
            if (isMounted && result.kind.type === "previewSvg") {
                onPreviewQueuedRef.current();
            }
        };

        listenersReadyRef.current = TauriApi.listenToCompileEvents({
            onQueued: markQueued,
            onStarted: markQueued,
            onSucceeded: applyResult,
            onFailed: applyResult,
            onDropped: applyResult,
        })
            .then((nextUnlisten) => {
                if (isMounted) {
                    unlisten = nextUnlisten;
                } else {
                    nextUnlisten?.();
                }
            })
            .catch(() => {
                unlisten = null;
            });

        return () => {
            isMounted = false;
            unlisten?.();
        };
    }, [listenersReadyRef]);
};
