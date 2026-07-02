import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PreviewPageFile } from "../bindings/PreviewPageFile";
import type { PagePtMetrics } from "../preview/previewPageMetrics";
import type { PreviewPageSize } from "../preview/previewZoom";

/**
 * Track per-page Typst size (width/height in pt) for the preview, unifying what
 * was four parallel stores in Preview.tsx:
 *
 * - The compile result (`previewPages[].width_pt/height_pt`) is the primary
 *   source once a compile reports sizes.
 * - An echo-back accumulator (`renderedPageMetrics`) carries sizes forward from
 *   a previous revision across the brief window where the new compile hasn't
 *   reported them yet — so zoom-fit math doesn't momentarily see zeros and jump.
 * - An identity-stable cache keeps the same object reference for unchanged
 *   sizes, so memoized page components skip re-render between keystrokes.
 *
 * The hook exposes:
 * - `initialMetricsByPage`: the merged record (primary → cache → echo-back),
 *   identity-stable per page, passed to page components as `initialMetrics`.
 * - `previewPageSizes`: the same data as an array aligned with `previewPages`,
 *   for zoom-fit math.
 * - `handlePageMetrics`: the echo-back callback page components call.
 */
export function usePreviewPageMetrics(
    previewPages: PreviewPageFile[],
    previewRevision: number | null,
): {
    initialMetricsByPage: Record<number, PagePtMetrics | null>;
    previewPageSizes: PreviewPageSize[];
    handlePageMetrics: (pageNumber: number, metrics: PagePtMetrics) => void;
} {
    // Echo-back accumulator: sizes surfaced upward by page components. Carries
    // data forward across a recompile that momentarily omits page sizes.
    const [renderedPageMetrics, setRenderedPageMetrics] = useState<
        Record<number, PagePtMetrics>
    >({});
    // Identity-stable cache so memoized page components keep the same prop
    // reference when the values haven't changed.
    const pageMetricsCacheRef = useRef<Record<number, PagePtMetrics>>({});

    const handlePageMetrics = useCallback(
        (pageNumber: number, metrics: PagePtMetrics) =>
            setRenderedPageMetrics((current) => ({
                ...current,
                [pageNumber]: metrics,
            })),
        [],
    );

    // Merged, identity-stable per-page metrics. Primary source is the compile
    // result; the cache preserves object identity; the echo-back is a fallback
    // for pages whose size the compile hasn't reported yet.
    const initialMetricsByPage = useMemo(() => {
        const cache = pageMetricsCacheRef.current;
        const map: Record<number, PagePtMetrics | null> = {};
        for (const page of previewPages) {
            if (page.width_pt && page.height_pt) {
                const existing = cache[page.page_number];
                if (
                    existing &&
                    existing.widthPt === page.width_pt &&
                    existing.heightPt === page.height_pt
                ) {
                    map[page.page_number] = existing;
                } else {
                    const metrics = {
                        widthPt: page.width_pt,
                        heightPt: page.height_pt,
                    };
                    cache[page.page_number] = metrics;
                    map[page.page_number] = metrics;
                }
            } else {
                map[page.page_number] =
                    renderedPageMetrics[page.page_number] ?? null;
            }
        }
        return map;
    }, [previewPages, renderedPageMetrics]);

    // Drop metrics for page numbers no longer in the compile result (e.g. after
    // opening a shorter project). Also clear while revision is unset.
    useEffect(() => {
        if (previewRevision === null) {
            setRenderedPageMetrics({});
            return;
        }

        const activePageNumbers = new Set(
            previewPages.map((page) => page.page_number),
        );

        setRenderedPageMetrics((current) => {
            let changed = false;
            const next: Record<number, PagePtMetrics> = {};
            for (const [key, metrics] of Object.entries(current)) {
                const pageNumber = Number(key);
                if (activePageNumbers.has(pageNumber)) {
                    next[pageNumber] = metrics;
                } else {
                    changed = true;
                }
            }
            return changed ? next : current;
        });
    }, [previewRevision, previewPages]);

    const previewPageSizes = useMemo<PreviewPageSize[]>(
        () =>
            previewPages.map((page) => {
                const pageMetrics = renderedPageMetrics[page.page_number];
                return {
                    widthPt: page.width_pt ?? pageMetrics?.widthPt ?? 0,
                    heightPt: page.height_pt ?? pageMetrics?.heightPt ?? 0,
                };
            }),
        [previewPages, renderedPageMetrics],
    );

    return { initialMetricsByPage, previewPageSizes, handlePageMetrics };
}
