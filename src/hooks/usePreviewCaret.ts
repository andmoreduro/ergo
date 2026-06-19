import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from "react";
import { logPreviewSyncError } from "../config/previewSync";
import { backendFocusIdsForEditorField } from "../editor/fieldIds";
import { pageNumberAtViewportCenter } from "../preview/previewScroll";
import { useDocumentFocusSelector } from "../state/DocumentContext";
import { CompilerClient } from "../workers/compilerClient";

export interface PreviewCaret {
    pageNumber: number;
    xPt: number;
    topYPt: number;
    heightPt: number;
}

export interface PreviewCaretState {
    caret: PreviewCaret | null;
    /** The preview revision the caret (or its absence) was resolved for; lets the
     *  scroll logic know forward sync has settled before falling back. */
    resolvedRevision: number | null;
}

interface CaretTarget {
    elementId: string | null;
    fieldId: string | null;
    caretUtf16Offset: number | null;
    previewRevision: number | null;
}

/** Fallback caret height (pt) when the backend resolves a position but no exact
 *  caret box — e.g. template inputs matched at the field/element level. */
const DEFAULT_CARET_HEIGHT_PT = 12;

/**
 * The backend's exact caret box when it has one, otherwise a cue synthesized
 * around the resolved position's vertical center. Without this, fields that
 * resolve to a rendered spot but no precise box (template form inputs) would
 * show no cue at all.
 */
const caretCueFor = (position: {
    yPt: number;
    caretCue: { topYPt: number; heightPt: number } | null;
}): { topYPt: number; heightPt: number } => {
    if (position.caretCue) {
        return position.caretCue;
    }
    return {
        topYPt: Math.max(0, position.yPt - DEFAULT_CARET_HEIGHT_PT * 0.5),
        heightPt: DEFAULT_CARET_HEIGHT_PT,
    };
};

const sameCaret = (a: PreviewCaret | null, b: PreviewCaret | null): boolean => {
    if (a === b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return (
        a.pageNumber === b.pageNumber &&
        a.xPt === b.xPt &&
        a.topYPt === b.topYPt &&
        a.heightPt === b.heightPt
    );
};

const sameTarget = (a: CaretTarget, b: CaretTarget): boolean =>
    a.elementId === b.elementId &&
    a.fieldId === b.fieldId &&
    a.caretUtf16Offset === b.caretUtf16Offset &&
    a.previewRevision === b.previewRevision;

/**
 * Forward sync: resolve the editor's live caret (element/field/offset) to its
 * rendered spot in the preview so a caret cue can be drawn there — the inverse
 * of clicking the preview to move the editor caret.
 *
 * Single-flight + trailing: only one position query runs at a time, and the
 * newest target is re-queried the instant the current one returns. A fast burst
 * (holding an arrow key) therefore issues ~one query per round-trip instead of
 * one per keystroke, so the caret tracks continuously rather than catching up
 * only when input stops, and the single-threaded worker isn't flooded while it's
 * also compiling. Debounced and gated on the displayed preview revision; `caret`
 * is null whenever the caret has no rendered position.
 */
export function usePreviewCaret(
    scrollRef: RefObject<HTMLElement | null>,
    previewRevision: number | null,
    debounceMs = 0,
): PreviewCaretState {
    const elementId = useDocumentFocusSelector((focus) => focus.elementId);
    const fieldId = useDocumentFocusSelector((focus) => focus.fieldId);
    const caretUtf16Offset = useDocumentFocusSelector(
        (focus) => focus.caretUtf16Offset,
    );

    const [caret, setCaret] = useState<PreviewCaret | null>(null);
    const [resolvedRevision, setResolvedRevision] = useState<number | null>(
        null,
    );
    const caretRef = useRef<PreviewCaret | null>(null);
    const targetRef = useRef<CaretTarget>({
        elementId: null,
        fieldId: null,
        caretUtf16Offset: null,
        previewRevision: null,
    });
    const inFlightRef = useRef(false);
    // Revision the currently shown cue was last resolved for. Lets a no-match
    // keep the cue on a same-revision caret move (e.g. landing on a collapsed
    // trailing space) but drop it once content changed (revision advanced) and
    // the new caret can't be placed, so the page-scroll fallback can take over.
    const cueRevisionRef = useRef<number | null>(null);
    // Page the cue was last resolved on; fallback anchor before the viewport is
    // measurable (e.g. the very first resolution).
    const lastPageRef = useRef<number | null>(null);

    const applyCaret = useCallback((next: PreviewCaret | null) => {
        if (!sameCaret(caretRef.current, next)) {
            caretRef.current = next;
            setCaret(next);
        }
    }, []);

    const run = useCallback(() => {
        if (inFlightRef.current) {
            return;
        }
        const target = targetRef.current;
        if (target.previewRevision === null || !target.elementId) {
            cueRevisionRef.current = null;
            applyCaret(null);
            setResolvedRevision(target.previewRevision);
            return;
        }

        // Editor field ids differ from the backend's — project/template inputs map
        // to the `inputs` element, figure captions to their caption field — so
        // resolve against the mapped ids or form fields never match.
        const mapped = backendFocusIdsForEditorField(
            target.elementId,
            target.fieldId,
        );

        // Anchor resolution to the page at the viewport center — the page the user
        // is actually looking at — so a field rendered in several spots (e.g. a
        // title in both the front matter and a running head) resolves to the copy
        // on screen instead of pulling the view to another copy.
        const scrollRoot = scrollRef.current;
        const anchorPageNumber =
            (scrollRoot ? pageNumberAtViewportCenter(scrollRoot) : null) ??
            lastPageRef.current;

        inFlightRef.current = true;
        void CompilerClient.positionsForFocus({
            elementId: mapped.elementId,
            fieldId: mapped.fieldId,
            caretUtf16Offset: target.caretUtf16Offset,
            anchorPageNumber,
            sourceRevision: target.previewRevision,
        })
            .then((result) => {
                inFlightRef.current = false;
                const position =
                    result.status === "matched" && result.positions.length > 0
                        ? result.positions[0]
                        : null;
                if (!position) {
                    // No rendered spot for the caret. Keep the cue only if it was
                    // resolved for this same revision (a transient move, e.g. onto
                    // a collapsed trailing space). If the revision advanced and the
                    // new caret can't be placed, drop the cue so the page-scroll
                    // fallback takes over — a caret left where the user isn't
                    // editing is confusing.
                    if (cueRevisionRef.current !== target.previewRevision) {
                        cueRevisionRef.current = null;
                        applyCaret(null);
                    }
                } else {
                    const cue = caretCueFor(position);
                    cueRevisionRef.current = target.previewRevision;
                    lastPageRef.current = position.pageNumber;
                    applyCaret({
                        pageNumber: position.pageNumber,
                        xPt: position.xPt,
                        topYPt: cue.topYPt,
                        heightPt: cue.heightPt,
                    });
                }
                setResolvedRevision(target.previewRevision);
                // Trailing: the caret moved while this query was in flight — go
                // resolve the latest position now.
                if (!sameTarget(targetRef.current, target)) {
                    run();
                }
            })
            .catch((error) => {
                inFlightRef.current = false;
                logPreviewSyncError("positionsForFocus", error);
            });
    }, [applyCaret, scrollRef]);

    useEffect(() => {
        targetRef.current = {
            elementId,
            fieldId,
            caretUtf16Offset,
            previewRevision,
        };
        const timer = window.setTimeout(run, debounceMs);
        return () => window.clearTimeout(timer);
    }, [elementId, fieldId, caretUtf16Offset, previewRevision, debounceMs, run]);

    return { caret, resolvedRevision };
}
