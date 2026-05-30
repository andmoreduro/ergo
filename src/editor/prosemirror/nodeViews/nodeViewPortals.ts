import type { ReactNode } from "react";

/**
 * Bridges ProseMirror NodeViews back into the host React tree.
 *
 * A NodeView's DOM is created imperatively by ProseMirror, so rendering React
 * into it with a fresh `createRoot` would detach it from every context provider
 * the app supplies (DocumentProvider, the action runtime, i18n, the editor field
 * registry, …). Instead each NodeView registers its DOM node + a render thunk
 * here, and `ProseMirrorBodyEditor` renders a `createPortal` for every entry from
 * inside the main tree — so context flows normally.
 */
export interface NodeViewPortalEntry {
    key: string;
    dom: HTMLElement;
    render: () => ReactNode;
}

export class NodeViewPortalRegistry {
    private entries = new Map<string, NodeViewPortalEntry>();
    private listeners = new Set<() => void>();
    private snapshot: NodeViewPortalEntry[] = [];

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    /** Stable between mutations so `useSyncExternalStore` does not loop. */
    getSnapshot = (): NodeViewPortalEntry[] => this.snapshot;

    register(entry: NodeViewPortalEntry): void {
        this.entries.set(entry.key, entry);
        this.emit();
    }

    update(key: string, render: () => ReactNode): void {
        const existing = this.entries.get(key);
        if (!existing) {
            return;
        }
        this.entries.set(key, { ...existing, render });
        this.emit();
    }

    unregister(key: string): void {
        if (this.entries.delete(key)) {
            this.emit();
        }
    }

    private emit(): void {
        this.snapshot = Array.from(this.entries.values());
        for (const listener of this.listeners) {
            listener();
        }
    }
}
