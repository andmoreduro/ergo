/**
 * Earliest JS execution timestamp, captured at module-eval time so it precedes
 * React mount, WASM worker spawn, and any async work. The performance harness
 * reads this to measure "app start → first paint."
 *
 * This module must be the first import in `main.tsx` for the timestamp to be
 * meaningful.
 */
export const APP_START_TIMESTAMP: number = Date.now();
