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

    // Step 2: once the project is active, apply the configured zoom and start
    // the replay. A high zoom makes a page span several viewports, so the
    // visible-band raster path (not full-page raster) is what gets measured.
    useEffect(() => {
        if (!hasActiveProject || !configRef.current || bootstrapped) {
            return;
        }
        const { zoom } = configRef.current;
        if (zoom != null && zoom > 0) {
            setPreviewZoomManual();
            setPreviewZoom(zoom);
        }

        // Record project-load timing: from openProject call to hasActiveProject
        // becoming true. This captures archive open + AST load + first compile
        // trigger (though not the full first paint, which Step 3 waits for).
        if (projectLoadStartedRef.current !== null) {
            const elapsed = Date.now() - projectLoadStartedRef.current;
            oneShotTimingsRef.current.push({
                label: "projectLoad",
                elapsedMs: elapsed,
            });
            // eslint-disable-next-line no-console
            console.log(
                `[perf] projectLoad: ${elapsed}ms (openProject → hasActiveProject)`,
            );
        }

        setBootstrapped(true);
    }, [hasActiveProject, bootstrapped, setPreviewZoom, setPreviewZoomManual]);

    // Step 3: typing loop + telemetry collection.
    useEffect(() => {
        if (!bootstrapped || !configRef.current) {
            return;
        }

        const config = configRef.current;
        const target: PerfTypingTarget = config.typingTarget;

        // Resolve the typing target from the AST.
        let paragraph: {
            paragraphId: string;
            initialText: string;
        } | null = null;
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
