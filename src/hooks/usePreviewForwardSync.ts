import { useMemo, useRef, type MouseEvent, type RefObject } from "react";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import {
    usePreviewCaret,
    type PreviewCaret,
} from "./usePreviewCaret";
import { usePreviewSync, type PreviewPageDescriptor } from "./usePreviewSync";
import { usePreviewViewportAnchor } from "./usePreviewViewportAnchor";

export type { PreviewCaret, PreviewPageDescriptor };

/**
 * Coordinate forward sync — the editor-caret → preview-cue direction — as a
 * single hook so the presentation component (`Preview`) doesn't wire the four
 * mutable refs that the three building-block hooks share.
 *
 * Three single-responsibility hooks stay as the internal building blocks:
 * - `usePreviewViewportAnchor` — one IntersectionObserver over page geometry
 * - `usePreviewCaret` — resolve the editor caret to a preview spot (debounced,
 *   single-flight)
 * - `usePreviewSync` — follow content changes by scrolling, and click-to-source
 *
 * The refs they share (`anchorPageRef`, `centerPageRef`, `pageVisibilityRef`,
 * `userScrolledAwayRef`) live here, so consumers see a single call instead of a
 * relay topology.
 */
export interface UsePreviewForwardSyncOptions {
    scrollRef: RefObject<HTMLElement | null>;
    previewRevision: number | null;
    previewPages: PreviewPageDescriptor[];
    dispatchAction: (invocation: ActionInvocation) => Promise<boolean>;
    /** Effective zoom; a change re-anchors the view so the caret stays visible. */
    zoom: number;
    /** Milliseconds to debounce resolving the editor caret's preview position. */
    forwardSyncDebounceMs: number;
    /** Draw a cue at every rendered spot, not just the one nearest the anchor. */
    multiCaret: boolean;
}

export interface UsePreviewForwardSyncResult {
    /** Cues grouped by page (stable per-page arrays; when there are none, an
     *  empty map so memoized page components skip re-render). */
    caretsByPage: Map<number, PreviewCaret[]>;
    /** Preview click handler — resolves the clicked spot back to an editor field. */
    handlePreviewClick: (event: MouseEvent<HTMLElement>) => void;
}

const EMPTY_MAP: Map<number, PreviewCaret[]> = new Map();

export function usePreviewForwardSync({
    scrollRef,
    previewRevision,
    previewPages,
    dispatchAction,
    zoom,
    forwardSyncDebounceMs,
    multiCaret,
}: UsePreviewForwardSyncOptions): UsePreviewForwardSyncResult {
    const { anchorPageRef, centerPageRef, pageVisibilityRef } =
        usePreviewViewportAnchor(scrollRef, previewPages);
    const userScrolledAwayRef = useRef(false);

    const { caret, carets, resolvedRevision } = usePreviewCaret({
        previewRevision,
        debounceMs: forwardSyncDebounceMs,
        centerPageRef,
        userScrolledAwayRef,
        multiCaret,
    });

    const { handlePreviewClick } = usePreviewSync({
        scrollRef,
        previewRevision,
        previewPages,
        dispatchAction,
        caret,
        // `resolvedRevision` is set whenever the latest position query completes
        // (matched or not); it gates the content-change scroll so the preview only
        // chases the caret once forward sync has settled for this revision.
        caretRevision: resolvedRevision,
        zoom,
        anchorPageRef,
        pageVisibilityRef,
        userScrolledAwayRef,
    });

    const caretsByPage = useMemo(() => {
        if (carets.length === 0) {
            return EMPTY_MAP;
        }
        const byPage = new Map<number, PreviewCaret[]>();
        for (const cue of carets) {
            const list = byPage.get(cue.pageNumber);
            if (list) {
                list.push(cue);
            } else {
                byPage.set(cue.pageNumber, [cue]);
            }
        }
        return byPage;
    }, [carets]);

    return { caretsByPage, handlePreviewClick };
}
