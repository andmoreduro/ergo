import { useEffect, useRef, useState } from "react";
import type { DocumentAST } from "../bindings/DocumentAST";
import type { DocumentEvent } from "../bindings/DocumentEvent";
import type { PerfHarnessConfig } from "../bindings/PerfHarnessConfig";
import type { PerfHarnessReport } from "../bindings/PerfHarnessReport";
import type { PreviewTelemetry } from "./previewTelemetry";
import { setPreviewTelemetryListener } from "./previewDiagnostics";
import { TauriApi } from "../api/tauri";
import { richTextPlainText } from "../state/documentEvents/helpers";
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

    const [bootstrapped, setBootstrapped] = useState(false);

    // Step 1: read config and open the target project.
    useEffect(() => {
        if (startedRef.current) {
            return;
        }
        void (async () => {
            const config = await TauriApi.getPerfConfig();
            if (!config.enabled || !config.projectPath) {
                return;
            }
            configRef.current = config;
            startedRef.current = true;
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
        setBootstrapped(true);
    }, [hasActiveProject, bootstrapped, setPreviewZoom, setPreviewZoomManual]);

    // Step 3: typing loop + telemetry collection.
    useEffect(() => {
        if (!bootstrapped || !configRef.current) {
            return;
        }

        const config = configRef.current;
        const paragraph = findFirstParagraph(ast);
        if (!paragraph) {
            // eslint-disable-next-line no-console
            console.error("[perf] no paragraph found");
            return;
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

        const run = async (): Promise<void> => {
            const { paragraphId, initialText } = paragraph;
            const total = config.keystrokeCount;
            const warmup = config.warmupKeystrokes;

            for (let i = 0; i < total && !cancelled; i++) {
                const nextText = `${initialText}${"x".repeat(i + 1)}`;
                const previousText =
                    i === 0 ? initialText : `${initialText}${"x".repeat(i)}`;

                const forward: DocumentEvent = {
                    type: "updateParagraphText",
                    element_id: paragraphId,
                    text: nextText,
                };
                const inverse: DocumentEvent = {
                    type: "updateParagraphText",
                    element_id: paragraphId,
                    text: previousText,
                };

                pendingIndexRef.current = i;
                commitDocumentEvents([forward], [inverse]);

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
                },
            };

            // eslint-disable-next-line no-console
            console.log(
                `[perf] ${recorded.length} samples · total mean/p50/p90 = ` +
                    `${totalSummary.mean.toFixed(1)}/${totalSummary.p50.toFixed(1)}/${totalSummary.p90.toFixed(1)} ms`,
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
