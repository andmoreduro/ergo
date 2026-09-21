import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { TauriApi } from "../api/tauri";
import { formatActionCatalogLabel } from "../actions/actionMessages";
import type { DispatchActionOptions } from "../actions/runtime";
import type { ActionAvailability } from "../bindings/ActionAvailability";
import type { ActionContextSnapshot } from "../bindings/ActionContextSnapshot";
import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import type { ActionId } from "../bindings/ActionId";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import type { CommandRegistry } from "../commands/registry";
import type { Command } from "../commands/types";
import { buildActionContextSnapshot } from "../editor/buildActionContextSnapshot";
import { formatKeySequence } from "../settings/keymap/profile";

/** A palette entry: a catalog action plus what the current context says about it. */
export interface PaletteCommand extends Command {
    /** Shortcut that triggers the action in the captured context, if any. */
    shortcut: string | null;
}

interface UseCommandPaletteOptions {
    commandRegistry: CommandRegistry;
    dispatchAction: (
        invocation: ActionInvocation,
        options?: DispatchActionOptions,
    ) => Promise<boolean>;
    /** The runtime's context snapshot builder (`useActiveActionContext`). */
    getSnapshot: (options?: { includeInputContext?: boolean }) => ActionContextSnapshot;
    open: boolean;
    setOpen: (open: boolean) => void;
    query: string;
    setQuery: (query: string) => void;
}

/**
 * Command palette model. The palette shows only the actions that apply to the
 * context focused when it opened (Rust evaluates each action's context
 * expression against a snapshot captured at that moment), with the shortcut
 * that would trigger them there, and runs the chosen action against that same
 * context — the palette dialog itself never becomes the action target.
 */
export const useCommandPalette = ({
    commandRegistry,
    dispatchAction,
    getSnapshot,
    open,
    setOpen,
    query,
    setQuery,
}: UseCommandPaletteOptions) => {
    const [actionCatalog, setActionCatalog] = useState<ActionDescriptor[]>([]);
    const [availability, setAvailability] = useState<Map<ActionId, ActionAvailability>>(
        () => new Map(),
    );
    // Context focused before the palette took focus; captured synchronously on
    // open so the dialog's own focus never replaces it.
    const openedFromRef = useRef<ActionContextSnapshot | null>(null);

    useEffect(() => {
        if (typeof TauriApi.getActionCatalog !== "function") {
            return;
        }

        let isMounted = true;
        void TauriApi.getActionCatalog()
            .then((catalog) => {
                if (isMounted) {
                    setActionCatalog(catalog);
                }
            })
            .catch(() => undefined);

        return () => {
            isMounted = false;
        };
    }, []);

    const captureContext = useCallback(() => {
        openedFromRef.current = buildActionContextSnapshot(
            document.activeElement,
            getSnapshot,
        );
    }, [getSnapshot]);

    useEffect(() => {
        if (!open) {
            setAvailability(new Map());
            return;
        }
        if (!openedFromRef.current) {
            captureContext();
        }
        const snapshot = openedFromRef.current;
        if (!snapshot || typeof TauriApi.listActionAvailability !== "function") {
            return;
        }
        let cancelled = false;
        void TauriApi.listActionAvailability(snapshot)
            .then((entries) => {
                if (!cancelled) {
                    setAvailability(new Map(entries.map((entry) => [entry.id, entry])));
                }
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [open, captureContext]);

    const paletteCommands = useMemo<PaletteCommand[]>(() => {
        const fromDescriptor = (descriptor: ActionDescriptor): PaletteCommand => {
            const registered = commandRegistry.get(descriptor.id);
            const entry = availability.get(descriptor.id);
            return {
                id: descriptor.id,
                label: formatActionCatalogLabel(
                    descriptor.id,
                    descriptor.description_key,
                ),
                scope: registered?.scope ?? "global",
                run: registered?.run ?? (() => undefined),
                isEnabled: registered?.isEnabled,
                shortcut: entry?.shortcut ? formatKeySequence(entry.shortcut) : null,
            };
        };

        const source =
            actionCatalog.length === 0
                ? commandRegistry.all().map((command) => ({ ...command, shortcut: null }))
                : actionCatalog.map(fromDescriptor);

        // Until availability arrives (or without the IPC), show everything;
        // once it is known, only actions whose context holds are listed.
        if (availability.size === 0) {
            return source;
        }
        return source.filter((command) => availability.get(command.id)?.available ?? true);
    }, [actionCatalog, availability, commandRegistry]);

    const deferredQuery = useDeferredValue(query);
    const filteredCommands = useMemo(() => {
        const needle = deferredQuery.trim().toLowerCase();
        if (!needle) {
            return paletteCommands;
        }

        return paletteCommands.filter(
            (command) =>
                command.label.toLowerCase().includes(needle) ||
                command.id.toLowerCase().includes(needle),
        );
    }, [deferredQuery, paletteCommands]);

    /** Opens the palette, remembering the context it was opened from. */
    const openPalette = useCallback(() => {
        captureContext();
        setOpen(true);
    }, [captureContext, setOpen]);

    const runCommand = useCallback(
        (actionId: ActionId) => {
            const fromContextId = openedFromRef.current?.focused_context_id ?? null;
            openedFromRef.current = null;
            setOpen(false);
            setQuery("");
            void dispatchAction(
                { id: actionId, payload: null },
                fromContextId ? { fromContextId } : undefined,
            );
        },
        [dispatchAction, setOpen, setQuery],
    );

    return {
        filteredCommands,
        runCommand,
        openPalette,
    };
};
