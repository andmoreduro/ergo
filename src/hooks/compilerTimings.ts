type TimingSample = {
    name: string;
    durationMs: number;
    startedAt: number;
    endedAt: number;
};

const now = (): number =>
    typeof performance === "undefined" ? Date.now() : performance.now();

const recordTimingSample = (sample: TimingSample) => {
    if (!import.meta.env.DEV || typeof window === "undefined") {
        return;
    }

    const timingWindow = window as typeof window & {
        __ergo_timings?: TimingSample[];
    };
    const samples = timingWindow.__ergo_timings ?? [];
    samples.push(sample);
    timingWindow.__ergo_timings = samples.slice(-50);
};

export const recordTiming = (name: string, startedAt: number) => {
    const endedAt = now();
    recordTimingSample({
        name,
        durationMs: endedAt - startedAt,
        startedAt,
        endedAt,
    });
};

export const recordDurationFromTimestamp = (name: string, timestamp: number) => {
    if (!timestamp) {
        return;
    }

    const endedAt = Date.now();
    recordTimingSample({
        name,
        durationMs: Math.max(0, endedAt - timestamp),
        startedAt: timestamp,
        endedAt,
    });
};

export const timingNow = now;
