/**
 * Cross-module input-pipeline timing bridge.
 *
 * The preview telemetry clock starts at `lastEvent.timestamp` — the moment an
 * AST event is queued for the worker sync loop. That is *after* the entire
 * synchronous input pipeline (contenteditable → ProseMirror transaction →
 * astBridge → sectionDiff → reducer) has run. To make that prefix visible in
 * the telemetry overlay, the ProseMirror body editor stamps the earliest
 * moment a transaction arrives (`handleTransaction` entry) here, and the
 * telemetry finalizer reads it to compute `inputToCommitMs`.
 *
 * This is measurement-only instrumentation: the timestamp lives outside React
 * state on purpose, so timing capture never triggers a re-render.
 *
 * At most one input timestamp is retained (the most recent), matching the
 * one-in-flight-at-a-time nature of typing. Non-typing commits (programmatic
 * edits, undo/redo) leave this unset; `getInputTimestamp` returns `null` and
 * the finalizer reports `inputToCommitMs: 0` for those.
 */
let inputTimestamp: number | null = null;

export const markInputReceived = (): void => {
    inputTimestamp = Date.now();
};

export const getInputTimestamp = (): number | null => inputTimestamp;

/** Test-only reset. */
export const resetInputTimestamp = (): void => {
    inputTimestamp = null;
};
