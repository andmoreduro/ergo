/** Log preview↔editor sync failures in development without shifting preview layout. */
export function logPreviewSyncError(context: string, error: unknown): void {
    if (import.meta.env.DEV) {
        console.error(`[preview] ${context}`, error);
    }
}
