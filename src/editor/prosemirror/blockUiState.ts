import { useCallback, useSyncExternalStore } from "react";

/**
 * Bridges a block element's ProseMirror UI state (whole-block selected vs. in
 * fine-grained editing) across the NodeView → React-portal boundary. The atom
 * NodeView pushes the current state keyed by element id; the embedded React
 * editors read it (e.g. to keep the extras/settings panel revealed while the
 * block is focused). Plain module state keeps it independent of React rendering
 * order, mirroring `activeView` / `pendingBlockEdit`.
 */
export interface BlockUiState {
    /** A whole-block NodeSelection rests on this element (locked highlight). */
    selected: boolean;
    /** The element is in fine-grained ("editing") mode. */
    editing: boolean;
}

const DEFAULT: BlockUiState = Object.freeze({ selected: false, editing: false });

const states = new Map<string, BlockUiState>();
const listeners = new Map<string, Set<() => void>>();

const notify = (elementId: string) => {
    listeners.get(elementId)?.forEach((listener) => listener());
};

export const setBlockUiState = (
    elementId: string,
    next: BlockUiState,
): void => {
    if (!elementId) {
        return;
    }
    const prev = states.get(elementId) ?? DEFAULT;
    if (prev.selected === next.selected && prev.editing === next.editing) {
        return;
    }
    states.set(elementId, Object.freeze({ ...next }));
    notify(elementId);
};

export const clearBlockUiState = (elementId: string): void => {
    if (elementId && states.delete(elementId)) {
        notify(elementId);
    }
};

export const getBlockUiState = (elementId: string): BlockUiState =>
    states.get(elementId) ?? DEFAULT;

export const getEditingBlockElementId = (): string | null => {
    for (const [elementId, state] of states) {
        if (state.editing) {
            return elementId;
        }
    }

    return null;
};

export const subscribeBlockUiState = (
    elementId: string,
    listener: () => void,
): (() => void) => {
    let set = listeners.get(elementId);
    if (!set) {
        set = new Set();
        listeners.set(elementId, set);
    }
    set.add(listener);
    return () => {
        set!.delete(listener);
        if (set!.size === 0) {
            listeners.delete(elementId);
        }
    };
};

/** React hook: the live selected/editing state for a block element. */
export const useBlockUiState = (elementId: string): BlockUiState => {
    const subscribe = useCallback(
        (listener: () => void) => subscribeBlockUiState(elementId, listener),
        [elementId],
    );
    const getSnapshot = useCallback(() => getBlockUiState(elementId), [elementId]);
    return useSyncExternalStore(subscribe, getSnapshot);
};
