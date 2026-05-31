/**
 * One-shot signal bridging an AST-level block insert (e.g. the toolbar/menu
 * "Insert table" command in `App.tsx`) to the ProseMirror body editor, which owns
 * the fine-grained edit-mode plugin state. The insert sets the pending id; the
 * body editor consumes it after the new block reconciles into the doc and opens
 * that block directly in fine-grained mode.
 */
let pendingBlockEditId: string | null = null;

export const setPendingBlockEdit = (elementId: string): void => {
    pendingBlockEditId = elementId;
};

/** Consume the pending request iff it targets `elementId`; otherwise leave it. */
export const takePendingBlockEditIfMatches = (elementId: string): boolean => {
    if (pendingBlockEditId !== null && pendingBlockEditId === elementId) {
        pendingBlockEditId = null;
        return true;
    }
    return false;
};
