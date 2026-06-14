import type { DocumentEvent } from "../bindings/DocumentEvent";
import { isDebugMenuEnabled } from "../config/debug";
import type { PreviewTelemetry } from "./previewTelemetry";

let telemetryListener: ((telemetry: PreviewTelemetry) => void) | null = null;

export const setPreviewTelemetryListener = (
    listener: ((telemetry: PreviewTelemetry) => void) | null,
): void => {
    telemetryListener = listener;
};

export const notifyPreviewTelemetry = (telemetry: PreviewTelemetry): void => {
    telemetryListener?.(telemetry);
};

/**
 * Dev-only per-keystroke capture for diagnosing live-app preview latency.
 *
 * Offline harnesses (native profiler, `scripts/wasm-keystroke-bench.*`) replay a
 * synthetic event stream and miss whatever the *running* app adds — main-thread
 * contention, real ProseMirror event shapes, a long-lived worker heap. This
 * records what the live sync loop actually sends and how long the worker took,
 * so a real session can be replayed and compared.
 *
 * Active only when `isDebugMenuEnabled()` (Vite dev, or `localStorage
 * ergo:debug=1`). Inert otherwise. Inspect from devtools via `window.__ergoPerf`:
 *   __ergoPerf.summary()    // mean/p50/p90 of compile vs observed round time
 *   __ergoPerf.events       // raw DocumentEvent[] to splice into a replay dump
 *   __ergoPerf.copyEvents() // copy those events to the clipboard
 *   __ergoPerf.clear()
 */
export interface CompileSample {
    /** Events sent to the worker for this sync round. */
    events: DocumentEvent[];
    /** Worker-measured `compile_preview` time (the overlay's `compile`). */
    compileMs: number;
    /** Main-thread `sync_events` round-trip. */
    syncMs: number;
    /**
     * Main-thread wall clock from the keystroke timestamp to the compile result
     * arriving. If this far exceeds `syncMs + compileMs`, the worker round was
     * delayed by queueing/contention rather than by compile cost itself.
     */
    roundMs: number;
}

interface PreviewPerfApi {
    samples: CompileSample[];
    events: DocumentEvent[];
    summary: () => void;
    copyEvents: () => void;
    clear: () => void;
}

const MAX_SAMPLES = 2000;
let samples: CompileSample[] = [];

const quantile = (sorted: number[], q: number): number =>
    sorted.length === 0
        ? 0
        : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

const stat = (key: keyof CompileSample, warmup = 3): string => {
    const values = samples
        .slice(warmup)
        .map((sample) => sample[key] as number)
        .sort((a, b) => a - b);
    if (values.length === 0) {
        return `${key}: (no data)`;
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return `${key}: mean ${mean.toFixed(1)} · p50 ${quantile(values, 0.5).toFixed(
        1,
    )} · p90 ${quantile(values, 0.9).toFixed(1)}`;
};

const installApi = (): void => {
    if (typeof window === "undefined") {
        return;
    }
    const api: PreviewPerfApi = {
        get samples() {
            return samples;
        },
        // Flattened event stream, ready to drop into a replay scenario's
        // `events` array (`scripts/wasm-keystroke-bench.*`).
        get events() {
            return samples.flatMap((sample) => sample.events);
        },
        summary() {
            // eslint-disable-next-line no-console
            console.log(
                `preview perf — ${samples.length} samples (warmup 3 dropped)\n` +
                    `  ${stat("compileMs")}\n` +
                    `  ${stat("syncMs")}\n` +
                    `  ${stat("roundMs")}`,
            );
        },
        copyEvents() {
            const json = JSON.stringify(this.events);
            void navigator.clipboard?.writeText(json);
            // eslint-disable-next-line no-console
            console.log(`copied ${this.events.length} events (${json.length} bytes)`);
        },
        clear() {
            samples = [];
        },
    };
    (window as unknown as { __ergoPerf: PreviewPerfApi }).__ergoPerf = api;
};

let installed = false;

/** Record one sync→compile round. No-op unless the debug flag is enabled. */
export const captureCompileSample = (sample: CompileSample): void => {
    if (!isDebugMenuEnabled()) {
        return;
    }
    if (!installed) {
        installApi();
        installed = true;
    }
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) {
        samples = samples.slice(-MAX_SAMPLES);
    }
    // One terse line per keystroke so contention is visible live: a roundMs far
    // above syncMs+compileMs means the worker result was delayed by queueing.
    // eslint-disable-next-line no-console
    console.log(
        `[perf] compile ${sample.compileMs}ms · sync ${sample.syncMs}ms · round ${sample.roundMs}ms · ${sample.events
            .map((event) => event.type)
            .join(",")}`,
    );
};
