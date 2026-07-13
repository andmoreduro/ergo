import { useEffect, useRef } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { PerfHarnessReport } from "../bindings/PerfHarnessReport";
import type { PerfOneShotTiming } from "../bindings/PerfOneShotTiming";
import type { PreviewTelemetry } from "./previewTelemetry";
import { setPreviewTelemetryListener } from "./previewDiagnostics";
import { TauriApi } from "../api/tauri";
import { richTextPlainText } from "../state/documentEvents/helpers";
import { APP_START_TIMESTAMP } from "../perf/appStartTimestamp";
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

/** Resolve after the browser has painted the next frame (double rAF). */
const waitForNextPaint = (): Promise<void> =>
    new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
        });
    });

export const usePerfReplay = ({
    hasActiveProject: _hasActiveProject,
    openProject,
    dispatch: _dispatch,
    ast,
    commitDocumentEvents,
    setPreviewZoom,
    setPreviewZoomManual,
}: UsePerfReplayOptions): void => {
    const startedRef = useRef(false);

    // Stable refs so the orchestration effect reads the latest values without
    // re-running when they change (the orchestration runs once).
    const openProjectRef = useRef(openProject);
    openProjectRef.current = openProject;
    const astRef = useRef(ast);
    astRef.current = ast;
    const commitDocumentEventsRef = useRef(commitDocumentEvents);
    commitDocumentEventsRef.current = commitDocumentEvents;
    const setPreviewZoomRef = useRef(setPreviewZoom);
    setPreviewZoomRef.current = setPreviewZoom;
    const setPreviewZoomManualRef = useRef(setPreviewZoomManual);
    setPreviewZoomManualRef.current = setPreviewZoomManual;

    useEffect(() => {
        if (startedRef.current) {
            return;
        }
        startedRef.current = true;

        let cancelled = false;
        const oneShotTimings: PerfOneShotTiming[] = [];
        const samples: PreviewTelemetry[] = [];

        /**
         * Wait for the next telemetry sample. Used by both the project-load
         * phase (one-shot: first preview paint) and the typing loop (per
         * keystroke). Returns when `setPreviewTelemetryListener` fires.
         */
        const waitForTelemetry = (): Promise<void> =>
            new Promise<void>((resolve) => {
                setPreviewTelemetryListener(() => {
                    resolve();
                });
            });

        /**
         * Wait for the next telemetry sample and capture it into `samples`.
         */
        const waitForTelemetryAndCapture = (): Promise<void> =>
            new Promise<void>((resolve) => {
                setPreviewTelemetryListener((telemetry) => {
                    samples.push(telemetry);
                    resolve();
                });
            });

        const run = async (): Promise<void> => {
            // ── Phase 1: Read config + measure app-start → first paint ────
            const config = await TauriApi.getPerfConfig();
            if (!config.enabled || !config.projectPath) {
                return;
            }

            // Measure app-start → first paint. APP_START_TIMESTAMP was
            // captured at the top of main.tsx module eval. The welcome screen
            // renders immediately on mount; double-rAF is the closest portable
            // proxy for "the browser painted the first frame."
            await waitForNextPaint();
            if (cancelled) return;
            const appStartElapsed = Date.now() - APP_START_TIMESTAMP;
            oneShotTimings.push({
                label: "appStart",
                elapsedMs: appStartElapsed,
            });
            // eslint-disable-next-line no-console
            console.log(
                `[perf] appStart: ${appStartElapsed}ms (module eval → first paint)`,
            );

            // ── Phase 2: Open project + measure project-load → first paint ─
            const loadStartedAt = Date.now();

            // Install a one-shot listener for the bootstrap compile's first
            // telemetry sample — the authoritative "preview is visible" signal.
            const firstPaintPromise = waitForTelemetry();

            await openProjectRef.current(config.projectPath);
            if (cancelled) return;

            await firstPaintPromise;
            if (cancelled) return;

            const projectLoadElapsed = Date.now() - loadStartedAt;
            oneShotTimings.push({
                label: "projectLoad",
                elapsedMs: projectLoadElapsed,
            });
            // eslint-disable-next-line no-console
            console.log(
                `[perf] projectLoad: ${projectLoadElapsed}ms (openProject → first preview paint)`,
            );

            // ── Phase 3: Apply zoom ────────────────────────────────────────
            const { zoom } = config;
            if (zoom != null && zoom > 0) {
                setPreviewZoomManualRef.current();
                setPreviewZoomRef.current(zoom);
            }

            // Give the zoom a moment to settle before typing.
            await sleep(100);
            if (cancelled) return;

            // ── Phase 4: Typing loop ───────────────────────────────────────
            const target = config.typingTarget;

            // Resolve the typing target from the AST (snapshot at this point).
            let paragraph: {
                paragraphId: string;
                initialText: string;
            } | null = null;
            let titleInitial: string | null = null;

            if (target === "formTitle") {
                titleInitial = getTitleValue(astRef.current);
            } else {
                paragraph = findFirstParagraph(astRef.current);
                if (!paragraph) {
                    // eslint-disable-next-line no-console
                    console.error("[perf] no paragraph found");
                    setPreviewTelemetryListener(null);
                    return;
                }
            }

            /** Build the forward/inverse DocumentEvent pair for one keystroke. */
            const buildKeystrokeEvents = (
                index: number,
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

            const total = config.keystrokeCount;
            const warmup = config.warmupKeystrokes;

            for (let i = 0; i < total && !cancelled; i++) {
                const events = buildKeystrokeEvents(i);
                if (!events) {
                    break;
                }

                // Capture mode: each keystroke pushes a sample into `samples`.
                const capturePromise = waitForTelemetryAndCapture();

                commitDocumentEventsRef.current(
                    [events.forward],
                    [events.inverse],
                );

                await capturePromise;
                if (cancelled) return;

                if (i >= warmup && config.keystrokeIntervalMs > 0) {
                    await sleep(config.keystrokeIntervalMs);
                }
            }

            if (cancelled) return;

            // ── Phase 5: Build report + exit ───────────────────────────────
            setPreviewTelemetryListener(null);

            const recorded = samples.slice(config.warmupKeystrokes);
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
                oneShotTimings,
            };

            const targetLabel = config.typingTarget;
            // eslint-disable-next-line no-console
            console.log(
                `[perf] target=${targetLabel} · ${recorded.length} samples · ` +
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
    }, []);
};
