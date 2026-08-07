import { useEffect, useRef, useState } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { PerfHarnessConfig } from "../bindings/PerfHarnessConfig";
import type { PerfHarnessReport } from "../bindings/PerfHarnessReport";
import type { PerfOneShotTiming } from "../bindings/PerfOneShotTiming";
import type { PerfTypingTarget } from "../bindings/PerfTypingTarget";
import type { PreviewTelemetry } from "./previewTelemetry";
import { setPreviewTelemetryListener } from "./previewDiagnostics";
import { TauriApi } from "../api/tauri";
import { richTextPlainText } from "../state/documentEvents/helpers";
import { APP_START_TIMESTAMP } from "../perf/appStartTimestamp";
import { getActiveBodyView } from "../editor/prosemirror/activeView";
import { TextSelection } from "prosemirror-state";
import type { ASTAction } from "../state/ast/actions";

interface UsePerfReplayOptions {
    hasActiveProject: boolean;
    openProject: (path: string) => Promise<void>;
    dispatch: React.Dispatch<ASTAction>;
    ast: DocumentAST;
    commitDocumentEvents: (
        forward: DocumentEvent[],
        inverse: DocumentEvent[],
    ) => void;
    /** Apply a manual preview zoom (used to exercise the raster-bound regime). */
    setPreviewZoom: (zoom: number) => void;
    setPreviewZoomManual: () => void;
}

const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

const findFirstParagraph = (
    ast: DocumentAST,
): { sectionId: string; paragraphId: string; initialText: string } | null => {
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }
        for (const element of section.elements) {
            if (element.type === "Paragraph") {
                return {
                    sectionId: section.id,
                    paragraphId: element.id,
                    initialText: richTextPlainText(element.content),
                };
            }
        }
    }
    return null;
};

/** Collect up to `count` body paragraphs, in document order. */
const findFirstParagraphs = (
    ast: DocumentAST,
    count: number,
): { paragraphId: string; initialText: string }[] => {
    const found: { paragraphId: string; initialText: string }[] = [];
    for (const section of ast.sections) {
        if (section.type !== "Content") {
            continue;
        }
        for (const element of section.elements) {
            if (element.type !== "Paragraph") {
                continue;
            }
            found.push({
                paragraphId: element.id,
                initialText: richTextPlainText(element.content),
            });
            if (found.length >= count) {
                return found;
            }
        }
    }
    return found;
};

/** Read the current title value from inputs (handles both `/title` and `title`). */
const getTitleValue = (ast: DocumentAST): string => {
    const raw = ast.inputs["/title"] ?? ast.inputs["title"];
    return typeof raw === "string" ? raw : "";
};

const quantile = (sorted: number[], q: number): number =>
    sorted.length === 0
        ? 0
        : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

const summarize = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mean =
        sorted.length === 0
            ? 0
            : sorted.reduce((a, b) => a + b, 0) / sorted.length;
    return {
        mean,
        p50: quantile(sorted, 0.5),
        p90: quantile(sorted, 0.9),
    };
};

export const usePerfReplay = ({
    hasActiveProject,
    openProject,
    dispatch,
    ast,
    commitDocumentEvents,
    setPreviewZoom,
    setPreviewZoomManual,
}: UsePerfReplayOptions): void => {
    const configRef = useRef<PerfHarnessConfig | null>(null);
    const startedRef = useRef(false);
    const samplesRef = useRef<PreviewTelemetry[]>([]);
    const pendingIndexRef = useRef<number | null>(null);
    const resolvePendingRef = useRef<(() => void) | null>(null);
    const oneShotTimingsRef = useRef<PerfOneShotTiming[]>([]);
    const projectLoadStartedRef = useRef<number | null>(null);

    const [bootstrapped, setBootstrapped] = useState(false);

    // Step 1: read config, measure app-start, and open the target project.
    useEffect(() => {
        if (startedRef.current) {
            return;
        }
        // Set the guard synchronously (before any await) so StrictMode's
        // double-invoke doesn't start two orchestration coroutines.
        startedRef.current = true;

        void (async () => {
            const config = await TauriApi.getPerfConfig();
            if (!config.enabled || !config.projectPath) {
                return;
            }
            configRef.current = config;

            // App-start timing: from the earliest module-eval timestamp to
            // now. This runs after React's first render + the async IPC round
            // trip, so it captures the full cold-start cost.
            const appStartElapsed = Date.now() - APP_START_TIMESTAMP;
            oneShotTimingsRef.current.push({
                label: "appStart",
                elapsedMs: appStartElapsed,
            });
            // eslint-disable-next-line no-console
            console.log(
                `[perf] appStart: ${appStartElapsed}ms (module eval → config read)`,
            );

            // Project-load timing starts here.
            projectLoadStartedRef.current = Date.now();

            await openProject(config.projectPath);
        })();
    }, [openProject]);

    // Step 2: once the project is active, apply the configured zoom, then wait
    // for the FIRST preview paint before typing. A high zoom makes a page span
    // several viewports, so the visible-band raster path (not full-page raster)
    // is what gets measured. Waiting for first paint is essential: the harness
    // previously typed the moment `hasActiveProject` flipped (AST loaded), which
    // is BEFORE bootstrap compile finishes — so it was measuring typing into a
    // worker still grinding through bootstrap, producing fake "constant latency".
    // The first telemetry sample arrives only after the first compile + canvas
    // paint, so it is the honest "document is ready" signal a user perceives.
    useEffect(() => {
        if (!hasActiveProject || !configRef.current || bootstrapped) {
            return;
        }
        const projectLoadStarted = projectLoadStartedRef.current;

        // Record project-load timing (open → AST loaded) immediately. This
        // captures archive open + AST load, distinct from first-paint below.
        if (projectLoadStarted !== null) {
            const elapsed = Date.now() - projectLoadStarted;
            oneShotTimingsRef.current.push({
                label: "projectLoad",
                elapsedMs: elapsed,
            });
            // eslint-disable-next-line no-console
            console.log(
                `[perf] projectLoad: ${elapsed}ms (openProject → hasActiveProject)`,
            );
        }

        const { zoom } = configRef.current;
        if (zoom != null && zoom > 0) {
            setPreviewZoomManual();
            setPreviewZoom(zoom);
        }

        // Install a one-shot listener for the bootstrap telemetry sample
        // (first paint). When it arrives, record firstPaintMs (open → first
        // paint) and flip bootstrapped so Step 3 starts the typing loop. This
        // listener is overwritten by Step 3's typing-sample listener.
        let cancelled = false;
        let firstPaintListenerFired = false;
        const firstPaintTimeout = setTimeout(() => {
            if (cancelled || firstPaintListenerFired) {
                return;
            }
            // eslint-disable-next-line no-console
            console.error(
                "[perf] first paint did not arrive within 60s; starting typing anyway",
            );
            oneShotTimingsRef.current.push({
                label: "firstPaint",
                elapsedMs:
                    projectLoadStarted !== null
                        ? Date.now() - projectLoadStarted
                        : 0,
            });
            setBootstrapped(true);
        }, 60000);
        setPreviewTelemetryListener(() => {
            if (cancelled || firstPaintListenerFired) {
                return;
            }
            firstPaintListenerFired = true;
            clearTimeout(firstPaintTimeout);
            if (projectLoadStarted !== null) {
                const elapsed = Date.now() - projectLoadStarted;
                oneShotTimingsRef.current.push({
                    label: "firstPaint",
                    elapsedMs: elapsed,
                });
                // eslint-disable-next-line no-console
                console.log(
                    `[perf] firstPaint: ${elapsed}ms (openProject → first preview paint)`,
                );
            }
            setBootstrapped(true);
        });

        return () => {
            cancelled = true;
            clearTimeout(firstPaintTimeout);
        };
    }, [hasActiveProject, bootstrapped, setPreviewZoom, setPreviewZoomManual]);

    // Step 3: typing loop + telemetry collection.
    useEffect(() => {
        if (!bootstrapped || !configRef.current) {
            return;
        }

        const config = configRef.current;
        const target: PerfTypingTarget = config.typingTarget;

        // Resolve the typing target from the AST. Each mode carries its own
        // mutable state so `buildKeystrokeEvents` can compute the next forward/
        // inverse pair without re-walking the AST.
        let titleInitial: string | null = null;
        let paragraph: {
            paragraphId: string;
            initialText: string;
        } | null = null;
        // bodyDelete: append phase, then delete phase. Tracks chars added.
        let deleteParagraph: {
            paragraphId: string;
            initialText: string;
        } | null = null;
        let appendedSoFar = 0;
        // bodyMultiEdit: cycle across up to 3 paragraphs, one char each.
        let multiParagraphs: {
            paragraphId: string;
            initialText: string;
        }[] = [];

        if (target === "formTitle") {
            titleInitial = getTitleValue(ast);
        } else if (target === "bodyMultiEdit") {
            multiParagraphs = findFirstParagraphs(ast, 3);
            if (multiParagraphs.length === 0) {
                // eslint-disable-next-line no-console
                console.error("[perf] no paragraphs found for multi-edit");
                return;
            }
        } else if (target === "bodyDelete") {
            deleteParagraph = findFirstParagraph(ast);
            if (!deleteParagraph) {
                // eslint-disable-next-line no-console
                console.error("[perf] no paragraph found for delete");
                return;
            }
        } else {
            paragraph = findFirstParagraph(ast);
            if (!paragraph) {
                // eslint-disable-next-line no-console
                console.error("[perf] no paragraph found");
                return;
            }
        }

        let cancelled = false;

        setPreviewTelemetryListener((telemetry) => {
            if (pendingIndexRef.current !== null) {
                samplesRef.current.push(telemetry);
                pendingIndexRef.current = null;
                resolvePendingRef.current?.();
                resolvePendingRef.current = null;
            }
        });

        const waitForTelemetry = async (): Promise<void> => {
            if (pendingIndexRef.current === null) {
                return;
            }
            return new Promise((resolve) => {
                resolvePendingRef.current = resolve;
            });
        };

        /**
         * Build the forward/inverse DocumentEvent pair for one keystroke.
         * `total` is the keystroke count from config, needed to split the
         * bodyDelete scenario into append/delete phases.
         */
        const buildKeystrokeEvents = (
            index: number,
            total: number,
        ): { forward: DocumentEvent; inverse: DocumentEvent } | null => {
            if (target === "formTitle" && titleInitial !== null) {
                const nextText = `${titleInitial}${"x".repeat(index + 1)}`;
                const prevText =
                    index === 0
                        ? titleInitial
                        : `${titleInitial}${"x".repeat(index)}`;
                return {
                    forward: {
                        type: "updateInput",
                        path: "/title",
                        value: nextText,
                    },
                    inverse: {
                        type: "updateInput",
                        path: "/title",
                        value: prevText,
                    },
                };
            }

            if (target === "bodyMultiEdit" && multiParagraphs.length > 0) {
                // Cycle across the paragraphs: keystroke i edits paragraph
                // i % count, appending one char to that paragraph's running
                // text. The first edit of each paragraph is index/count, so
                // the char count for paragraph p is floor(i/count) + 1.
                const count = multiParagraphs.length;
                const p = index % count;
                const rounds = Math.floor(index / count);
                const para = multiParagraphs[p]!;
                const nextText = `${para.initialText}${"x".repeat(rounds + 1)}`;
                const prevText =
                    rounds === 0
                        ? para.initialText
                        : `${para.initialText}${"x".repeat(rounds)}`;
                return {
                    forward: {
                        type: "updateParagraphText",
                        element_id: para.paragraphId,
                        text: nextText,
                    },
                    inverse: {
                        type: "updateParagraphText",
                        element_id: para.paragraphId,
                        text: prevText,
                    },
                };
            }

            if (target === "bodyDelete" && deleteParagraph) {
                // First half appends one 'x' per keystroke; second half
                // removes one at a time back to the initial text. Each delete
                // is the inverse of the symmetric append from the first half.
                const half = Math.floor(total / 2);
                const { paragraphId, initialText } = deleteParagraph;
                if (index < half) {
                    // Append phase.
                    appendedSoFar = index + 1;
                    const nextText = `${initialText}${"x".repeat(appendedSoFar)}`;
                    const prevText = `${initialText}${"x".repeat(index)}`;
                    return {
                        forward: {
                            type: "updateParagraphText",
                            element_id: paragraphId,
                            text: nextText,
                        },
                        inverse: {
                            type: "updateParagraphText",
                            element_id: paragraphId,
                            text: prevText,
                        },
                    };
                }
                // Delete phase: remove one char per keystroke.
                const remaining = appendedSoFar - (index - half);
                if (remaining < 0) {
                    return null;
                }
                const nextText = `${initialText}${"x".repeat(remaining)}`;
                const prevText = `${initialText}${"x".repeat(remaining + 1)}`;
                return {
                    forward: {
                        type: "updateParagraphText",
                        element_id: paragraphId,
                        text: nextText,
                    },
                    inverse: {
                        type: "updateParagraphText",
                        element_id: paragraphId,
                        text: prevText,
                    },
                };
            }

            if (!paragraph) {
                return null;
            }

            const { paragraphId, initialText } = paragraph;
            const nextText = `${initialText}${"x".repeat(index + 1)}`;
            const prevText =
                index === 0
                    ? initialText
                    : `${initialText}${"x".repeat(index)}`;
            return {
                forward: {
                    type: "updateParagraphText",
                    element_id: paragraphId,
                    text: nextText,
                },
                inverse: {
                    type: "updateParagraphText",
                    element_id: paragraphId,
                    text: prevText,
                },
            };
        };

        /**
         * Drive REAL ProseMirror transactions through the live body editor
         * (`view.dispatch(tr.insertText(...))`). Unlike the other targets, this
         * exercises the full input pipeline — contenteditable → transaction →
         * astBridge → sectionDiff → reducer — so `inputToCommitMs` reflects
         * true perceived latency instead of 0. The body editor view must be
         * mounted (it is, once the project is open and the editor pane shows).
         */
        const runProseMirror = async (
            total: number,
            warmup: number,
            isCancelled: () => boolean,
        ): Promise<void> => {
            // Wait for the body editor view to mount (it registers via
            // setActiveBodyView on focus/mount). Poll briefly.
            let view = getActiveBodyView();
            for (let w = 0; !view && w < 50 && !isCancelled(); w++) {
                await sleep(100);
                view = getActiveBodyView();
            }
            if (!view) {
                // eslint-disable-next-line no-console
                console.error("[perf] body editor view never mounted");
                return;
            }

            // Focus + place the cursor inside the first text block. The body
            // doc's first child is the first paragraph; position 1 lands just
            // past its opening token. Each subsequent insertText appends at
            // the cursor, flowing through handleTransaction (which stamps
            // markInputReceived) — the real input→commit path.
            view.focus();
            view.dispatch(
                view.state.tr.setSelection(
                    TextSelection.near(view.state.doc.resolve(1)),
                ),
            );

            for (let i = 0; i < total && !isCancelled(); i++) {
                const current = getActiveBodyView();
                if (!current) {
                    break;
                }
                pendingIndexRef.current = i;
                // Real input through the live editor. The second half of the
                // run deletes one char per keystroke (backspace-equivalent),
                // exercising the shrink path too.
                if (i >= total / 2) {
                    const s = current.state;
                    const at = s.selection.head;
                    current.dispatch(s.tr.delete(at - 1, at));
                } else {
                    current.dispatch(current.state.tr.insertText("x"));
                }

                await waitForTelemetry();

                if (i >= warmup && config.keystrokeIntervalMs > 0) {
                    await sleep(config.keystrokeIntervalMs);
                }
            }
        };

        const run = async (): Promise<void> => {
            const total = config.keystrokeCount;
            const warmup = config.warmupKeystrokes;

            if (target === "bodyProseMirror") {
                await runProseMirror(total, warmup, () => cancelled);
            } else {
                for (let i = 0; i < total && !cancelled; i++) {
                    const events = buildKeystrokeEvents(i, total);
                    if (!events) {
                        break;
                    }

                    pendingIndexRef.current = i;
                    commitDocumentEvents([events.forward], [events.inverse]);

                    await waitForTelemetry();

                    if (i >= warmup && config.keystrokeIntervalMs > 0) {
                        await sleep(config.keystrokeIntervalMs);
                    }
                }
            }

            const recorded = samplesRef.current.slice(config.warmupKeystrokes);
            const totalLatencies = recorded.map((s) => s.totalLatencyMs);
            const compileLatencies = recorded.map((s) => s.compileMs);
            const renderLatencies = recorded.map((s) => s.svgRenderMs);
            const scheduleLatencies = recorded.map((s) => s.scheduleMs);

            const totalSummary = summarize(totalLatencies);
            const compileSummary = summarize(compileLatencies);

            // First post-warmup keystroke — typically much higher than steady
            // state due to JIT warmup, font cache misses, lazy init.
            const firstKeystrokeMs =
                recorded.length > 0 ? recorded[0]!.totalLatencyMs : null;

            const report: PerfHarnessReport = {
                config,
                samples: recorded.map((s, idx) => ({
                    keystrokeIndex: idx + warmup,
                    totalLatencyMs: s.totalLatencyMs,
                    queuedToSyncMs: s.queuedToSyncMs,
                    workerSyncMs: s.workerSyncMs,
                    compileMs: s.compileMs,
                    svgRenderMs: s.svgRenderMs,
                    scheduleMs: s.scheduleMs,
                    deferMs: s.deferMs,
                    commitMs: s.commitMs,
                    reactCommitMs: s.reactCommitMs,
                    paintMs: s.paintMs,
                    workerRenderMs: s.workerRenderMs,
                    domWriteMs: s.domWriteMs,
                    rasterMs: s.rasterMs,
                })),
                summary: {
                    sampleCount: recorded.length,
                    totalLatencyMeanMs: totalSummary.mean,
                    totalLatencyP50Ms: totalSummary.p50,
                    totalLatencyP90Ms: totalSummary.p90,
                    compileMeanMs: compileSummary.mean,
                    compileP50Ms: compileSummary.p50,
                    compileP90Ms: compileSummary.p90,
                    svgRenderMeanMs: summarize(renderLatencies).mean,
                    scheduleMeanMs: summarize(scheduleLatencies).mean,
                    firstKeystrokeMs,
                },
                oneShotTimings: oneShotTimingsRef.current,
            };

            // eslint-disable-next-line no-console
            console.log(
                `[perf] target=${target} · ${recorded.length} samples · ` +
                    `total mean/p50/p90 = ` +
                    `${totalSummary.mean.toFixed(1)}/${totalSummary.p50.toFixed(1)}/${totalSummary.p90.toFixed(1)} ms` +
                    (firstKeystrokeMs !== null
                        ? ` · first=${firstKeystrokeMs}ms`
                        : ""),
            );

            await TauriApi.writePerfReportAndExit(report);
        };

        void run();

        return () => {
            cancelled = true;
            setPreviewTelemetryListener(null);
        };
    }, [bootstrapped, ast, commitDocumentEvents, dispatch]);
};
