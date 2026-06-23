import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type MutableRefObject,
} from "react";
import { logPreviewSyncError } from "../config/previewSync";
import { backendFocusIdsForEditorField } from "../editor/fieldIds";
import { useDocumentFocusSelector } from "../state/DocumentContext";
import { CompilerClient } from "../workers/compilerClient";

export interface PreviewCaret {
    pageNumber: number;
    xPt: number;
    topYPt: number;
    heightPt: number;
}

export interface PreviewCaretState {
    /** Primary cue (nearest the anchor): drives follow/auto-scroll. Null = none. */
    caret: PreviewCaret | null;
    /** Every cue to draw. With multi-caret off, just the primary; with it on, the
     *  caret at each rendered spot (copies on off-screen pages sit off-screen). */
    carets: PreviewCaret[];
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

const sameCarets = (a: PreviewCaret[], b: PreviewCaret[]): boolean => {
    if (a === b) {
        return true;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let index = 0; index < a.length; index += 1) {
        if (!sameCaret(a[index], b[index])) {
            return false;
        }
    }
    return true;
};

const caretFromPosition = (position: {
    pageNumber: number;
    xPt: number;
    yPt: number;
    caretCue: { topYPt: number; heightPt: number } | null;
}): PreviewCaret => {
    const cue = caretCueFor(position);
    return {
        pageNumber: position.pageNumber,
        xPt: position.xPt,
        topYPt: cue.topYPt,
        heightPt: cue.heightPt,
    };
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
export interface UsePreviewCaretOptions {
    previewRevision: number | null;
    debounceMs?: number;
    /** Page the viewport center falls in; the search anchor while browsing away. */
    centerPageRef: MutableRefObject<number | null>;
    /** True while the user has scrolled the caret's page out of view. */
    userScrolledAwayRef: MutableRefObject<boolean>;
    /** Draw a cue at every rendered spot, not just the one nearest the anchor. */
    multiCaret: boolean;
}

export function usePreviewCaret({
    previewRevision,
    debounceMs = 0,
    centerPageRef,
    userScrolledAwayRef,
    multiCaret,
}: UsePreviewCaretOptions): PreviewCaretState {
    const elementId = useDocumentFocusSelector((focus) => focus.elementId);
    const fieldId = useDocumentFocusSelector((focus) => focus.fieldId);
    const caretUtf16Offset = useDocumentFocusSelector(
        (focus) => focus.caretUtf16Offset,
    );

    const [carets, setCarets] = useState<PreviewCaret[]>([]);
    const [resolvedRevision, setResolvedRevision] = useState<number | null>(
        null,
    );
    const caretsRef = useRef<PreviewCaret[]>([]);
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

    const applyCarets = useCallback((next: PreviewCaret[]) => {
        if (!sameCarets(caretsRef.current, next)) {
            caretsRef.current = next;
            setCarets(next);
        }
    }, []);

    const run = useCallback(() => {
        if (inFlightRef.current) {
            return;
        }
        const target = targetRef.current;
        if (target.previewRevision === null || !target.elementId) {
            cueRevisionRef.current = null;
            applyCarets([]);
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

        // Default: follow the caret — anchor to the page the cue was last on, so
        // a field rendered in several spots stays on the copy the caret already
        // tracks. This costs nothing (no viewport measuring) on the typing hot
        // path. Only once the user has scrolled the caret's page out of view do we
        // search from the page the viewport center falls in, so the cue lands on
        // the copy they're looking at without the per-keystroke sweep that made
        // typing slow.
        const anchorPageNumber = userScrolledAwayRef.current
            ? (centerPageRef.current ?? lastPageRef.current)
            : lastPageRef.current;

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
                // The backend returns every rendered spot, primary (nearest the
                // anchor) first.
                const positions =
                    result.status === "matched" ? result.positions : [];
                if (positions.length === 0) {
                    // No rendered spot for the caret. Keep the cue only if it was
                    // resolved for this same revision (a transient move, e.g. onto
                    // a collapsed trailing space). If the revision advanced and the
                    // new caret can't be placed, drop the cue so the page-scroll
                    // fallback takes over — a caret left where the user isn't
                    // editing is confusing.
                    if (cueRevisionRef.current !== target.previewRevision) {
                        cueRevisionRef.current = null;
                        applyCarets([]);
                    }
                } else {
                    cueRevisionRef.current = target.previewRevision;
                    lastPageRef.current = positions[0].pageNumber;
                    // With multi-caret on, draw a cue at every rendered spot;
                    // otherwise only the primary. Off-screen copies just sit on
                    // their (scrolled-out) page, so this needs no viewport filter.
                    const selected = multiCaret ? positions : [positions[0]];
                    applyCarets(selected.map(caretFromPosition));
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
    }, [applyCarets, centerPageRef, userScrolledAwayRef, multiCaret]);

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

    return { caret: carets[0] ?? null, carets, resolvedRevision };
}
