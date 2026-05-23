import { useEffect, useRef, type MutableRefObject } from "react";

import { TauriApi } from "../api/tauri";
import type { CompilationResult } from "../bindings/CompilationResult";
import type { DocumentResources } from "../bindings/DocumentResources";

interface UseCompileBridgeOptions {
    listenersReadyRef: MutableRefObject<Promise<void>>;
    onPreviewStarted: () => void;
    onPreviewResult: (result: CompilationResult) => void | Promise<void>;
    onResourcesUpdated?: (resources: DocumentResources) => void;
}

export const useCompileBridge = ({
    listenersReadyRef,
    onPreviewStarted,
    onPreviewResult,
    onResourcesUpdated,
}: UseCompileBridgeOptions) => {
    const onPreviewStartedRef = useRef(onPreviewStarted);
    onPreviewStartedRef.current = onPreviewStarted;
    const onPreviewResultRef = useRef(onPreviewResult);
    onPreviewResultRef.current = onPreviewResult;
    const onResourcesUpdatedRef = useRef(onResourcesUpdated);
    onResourcesUpdatedRef.current = onResourcesUpdated;

    useEffect(() => {
        let isMounted = true;
        let unlisten: (() => void) | null = null;
        let resUnlisten: (() => void) | null = null;

        const markStarted = () => {
            if (isMounted) {
                onPreviewStartedRef.current();
            }
        };

        const applyResult = (result: CompilationResult) => {
            if (isMounted) {
                void onPreviewResultRef.current(result);
            }
        };

        const applyResources = (resources: DocumentResources) => {
            if (isMounted) {
                onResourcesUpdatedRef.current?.(resources);
            }
        };

        Promise.all([
            TauriApi.listenToCompileEvents({
                onStarted: markStarted,
                onSucceeded: applyResult,
                onFailed: applyResult,
            }),
            TauriApi.listenToResourcesEvents(applyResources),
        ])
            .then(([nextUnlisten, nextResUnlisten]) => {
                if (isMounted) {
                    unlisten = nextUnlisten;
                    resUnlisten = nextResUnlisten;
                } else {
                    nextUnlisten?.();
                    nextResUnlisten?.();
                }
            });

        return () => {
            isMounted = false;
            unlisten?.();
            resUnlisten?.();
        };
    }, [listenersReadyRef]);
};
