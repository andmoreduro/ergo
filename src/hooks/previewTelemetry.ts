export interface PreviewTelemetry {
    totalLatencyMs: number;
    queuedToSyncMs: number;
    workerSyncMs: number;
    compileMs: number;
    paintMs: number;
}

export interface PendingPreviewTelemetry {
    revision: number;
    startedAt: number;
    compileResultAt: number;
    queuedToSyncMs: number;
    workerSyncMs: number;
    compileMs: number;
}

export const nowMs = (): number => Date.now();

export const elapsedMs = (startedAt: number, endedAt: number): number =>
    Math.max(0, Math.round(endedAt - startedAt));
