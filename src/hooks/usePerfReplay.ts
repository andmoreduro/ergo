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

    // Flow state: each phase gates the next.
    const [configLoaded, setConfigLoaded] = useState(false);
    const [projectOpened, setProjectOpened] = useState(false);
    const [bootstrapped, setBootstrapped] = useState(false);

    // ── Phase 1: Read config + measure app-start → first paint ───────────
    //
    // APP_START_TIMESTAMP was captured at the top of main.tsx module eval.
    // We wait for the next paint cycle (double rAF) to get "pixels on screen"
    // for the welcome screen, then record the elapsed time and open the project.
    useEffect(() => {
        if (startedRef.current) {
            return;
        }
        startedRef.current = true;

        void (async () => {
            const config = await TauriApi.getPerfConfig();
            if (!config.enabled || !config.projectPath) {
                return;
            }
            configRef.current = config;

            // Measure app-start → first paint. The welcome screen renders
            // immediately on mount; double-rAF is the closest portable proxy
            // for "the browser painted the first frame."
            await waitForNextPaint();
            const appStartElapsed = Date.now() - APP_START_TIMESTAMP;
            oneShotTimingsRef.current.push({
                label: "appStart",
                elapsedMs: appStartElapsed,
            });
            // eslint-disable-next-line no-console
            console.log(
                `[perf] appStart: ${appStartElapsed}ms (module eval → first paint)`,
            );

            setConfigLoaded(true);
        })();
    }, []);

    // ── Phase 2: Open project + measure project-load → first preview paint ──
    //
    // The "project loaded" end-marker is the first preview paint, detected by
    // listening for the first telemetry sample (which fires when
    // markMainPreviewPainted runs after the bootstrap compile).
    useEffect(() => {
        if (!configLoaded || !configRef.current) {
            return;
        }

        let cancelled = false;
        const loadStartedAt = Date.now();

        // One-shot listener: resolves on the first telemetry sample, which
        // is emitted by markMainPreviewPainted after the bootstrap compile's
        // first page renders. This is the authoritative "preview is visible"
        // signal.
        const firstPaintPromise = new Promise<void>((resolve) => {
            setPreviewTelemetryListener(() => {
                if (!cancelled) {
                    resolve();
                }
            });
        });

        void (async () => {
            const projectPath = configRef.current!.projectPath!;
            await openProject(projectPath);

            // Wait for the first preview paint telemetry.
            await firstPaintPromise;

            if (!cancelled) {
                const elapsed = Date.now() - loadStartedAt;
                oneShotTimingsRef.current.push({
                    label: "projectLoad",
                    elapsedMs: elapsed,
                });
                // eslint-disable-next-line no-console
                console.log(
                    `[perf] projectLoad: ${elapsed}ms (openProject → first preview paint)`,
                );

                // Clear the one-shot listener so the typing phase can install
                // its own.
                setPreviewTelemetryListener(null);
                setProjectOpened(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [configLoaded, openProject]);

    // ── Phase 3: Apply zoom before typing ────────────────────────────────
    useEffect(() => {
        if (!projectOpened || !configRef.current || bootstrapped) {
            return;
        }
        const { zoom } = configRef.current;
        if (zoom != null && zoom > 0) {
            setPreviewZoomManual();
            setPreviewZoom(zoom);
        }
        setBootstrapped(true);
    }, [projectOpened, bootstrapped, setPreviewZoom, setPreviewZoomManual]);

    // ── Phase 4: Typing loop + telemetry collection ──────────────────────
    //
    // The typing target (body paragraph vs form title field) is selected by
    // ERGO_PERF_TYPING_TARGET. Each keystroke dispatches a DocumentEvent and
    // waits for the corresponding telemetry sample (compile → preview paint).
    useEffect(() => {
        if (!bootstrapped || !configRef.current) {
            return;
        }

        const config = configRef.current;
        const target: PerfTypingTarget = config.typingTarget;

        // Resolve the typing target from the AST.
        let paragraph: { paragraphId: string; initialText: string } | null =
            null;
        let titleInitial: string | null = null;

        if (target === "formTitle") {
            titleInitial = getTitleValue(ast);
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

        const run = async (): Promise<void> => {
            const total = config.keystrokeCount;
            const warmup = config.warmupKeystrokes;

            for (let i = 0; i < total && !cancelled; i++) {
                const events = buildKeystrokeEvents(i);
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

            const recorded = samplesRef.current.slice(config.warmupKeystrokes);
            const totalLatencies = recorded.map((s) => s.totalLatencyMs);
            const compileLatencies = recorded.map((s) => s.compileMs);
            const renderLatencies = recorded.map((s) => s.svgRenderMs);
            const scheduleLatencies = recorded.map((s) => s.scheduleMs);

            const totalSummary = summarize(totalLatencies);
            const compileSummary = summarize(compileLatencies);

            // First post-warmup keystroke (the one users feel as "first typing
            // after the app settles"). Typically much higher than steady state.
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
    }, [bootstrapped, ast, commitDocumentEvents, dispatch]);
};
