import { isDebugMenuEnabled } from "../settings/debug";
import type { PreviewTelemetry } from "./previewTelemetry";

let telemetryListener: ((telemetry: PreviewTelemetry) => void) | null = null;

export const setPreviewTelemetryListener = (
    listener: ((telemetry: PreviewTelemetry) => void) | null,
): void => {
    telemetryListener = listener;
};

/**
 * Fan-out for a finalized preview-telemetry sample (one per keystroke, once the
 * edited page has painted). Routes to the harness listener and, when debug is
 * on, mirrors the overlay's view to the console + `window.__ergoPerf` so the
 * numbers are machine-readable without a human watching the on-screen overlay.
 */
export const notifyPreviewTelemetry = (telemetry: PreviewTelemetry): void => {
    telemetryListener?.(telemetry);

    if (isDebugMenuEnabled()) {
        previewTelemetrySamples.push(telemetry);
        if (previewTelemetrySamples.length > MAX_TELEMETRY_SAMPLES) {
            previewTelemetrySamples.shift();
        }
        // eslint-disable-next-line no-console
        console.log(
            `[perf] input→commit=${telemetry.inputToCommitMs}ms ` +
                `total=${telemetry.totalLatencyMs}ms ` +
                `queue=${telemetry.queuedToSyncMs}ms ` +
                `sync=${telemetry.workerSyncMs}ms ` +
                `compile=${telemetry.compileMs}ms ` +
                `render=${telemetry.svgRenderMs}ms ` +
                `(defer ${telemetry.deferMs}/commit ${telemetry.commitMs}/` +
                `worker ${telemetry.workerRenderMs}/dom ${telemetry.domWriteMs}/raster ${telemetry.rasterMs})`,
        );
        installPerfTelemetryApi();
    }
};

const MAX_TELEMETRY_SAMPLES = 2000;
const previewTelemetrySamples: PreviewTelemetry[] = [];

const quantile = (sorted: number[], q: number): number =>
    sorted.length === 0
        ? 0
        : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

interface PerfTelemetryApi {
    /** Raw per-keystroke telemetry samples (same object the overlay reads). */
    telemetry: PreviewTelemetry[];
    /** mean/p50/p90/min/max per field, dropping the first 3 (warmup) samples. */
    summary: () => void;
    clear: () => void;
}

const TELEMETRY_FIELDS: (keyof PreviewTelemetry)[] = [
    "inputToCommitMs",
    "totalLatencyMs",
    "queuedToSyncMs",
    "workerSyncMs",
    "compileMs",
    "svgRenderMs",
    "scheduleMs",
    "deferMs",
    "commitMs",
    "reactCommitMs",
    "paintMs",
    "workerRenderMs",
    "domWriteMs",
    "rasterMs",
];

let perfTelemetryApiInstalled = false;

/** Installs `window.__ergoPerf` exposing the live telemetry buffer + summary. */
const installPerfTelemetryApi = (): void => {
    if (perfTelemetryApiInstalled || typeof window === "undefined") {
        return;
    }
    perfTelemetryApiInstalled = true;
    const api: PerfTelemetryApi = {
        get telemetry() {
            return previewTelemetrySamples;
        },
        summary() {
            const usable = previewTelemetrySamples.slice(3);
            if (usable.length === 0) {
                // eslint-disable-next-line no-console
                console.log("[perf] no telemetry samples yet");
                return;
            }
            // eslint-disable-next-line no-console
            console.log(
                `preview perf — ${usable.length} samples (warmup 3 dropped)`,
            );
            for (const field of TELEMETRY_FIELDS) {
                const values = usable
                    .map((s) => s[field])
                    .sort((a, b) => a - b);
                const mean = Math.round(
                    values.reduce((a, b) => a + b, 0) / values.length,
                );
                // eslint-disable-next-line no-console
                console.log(
                    `  ${field}: mean ${mean}ms · p50 ${quantile(values, 0.5)} · p90 ${quantile(values, 0.9)} · min ${values[0]} · max ${values[values.length - 1]}`,
                );
            }
        },
        clear() {
            previewTelemetrySamples.length = 0;
        },
    };
    const w = window as unknown as { __ergoPerf?: Partial<PerfTelemetryApi> };
    w.__ergoPerf = { ...(w.__ergoPerf ?? {}), ...api };
};
