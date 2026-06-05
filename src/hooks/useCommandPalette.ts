import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { TauriApi } from "../api/tauri";
import { formatActionCatalogLabel } from "../actions/actionMessages";
import type { ActionDescriptor } from "../bindings/ActionDescriptor";
import type { ActionId } from "../bindings/ActionId";
import type { ActionInvocation } from "../bindings/ActionInvocation";
import type { CommandRegistry } from "../commands/registry";
import type { Command } from "../commands/types";

interface UseCommandPaletteOptions {
    commandRegistry: CommandRegistry;
    dispatchAction: (invocation: ActionInvocation) => Promise<boolean>;
    setOpen: (open: boolean) => void;
    query: string;
    setQuery: (query: string) => void;
}

export const useCommandPalette = ({
    commandRegistry,
    dispatchAction,
    setOpen,
    query,
    setQuery,
}: UseCommandPaletteOptions) => {
    const [actionCatalog, setActionCatalog] = useState<ActionDescriptor[]>([]);

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

    const paletteCommands = useMemo<Command[]>(() => {
        const fromDescriptor = (descriptor: ActionDescriptor): Command => {
            const registered = commandRegistry.get(descriptor.id);
            return {
                id: descriptor.id,
                label: formatActionCatalogLabel(
                    descriptor.id,
                    descriptor.description_key,
                ),
                scope: registered?.scope ?? "global",
                run: registered?.run ?? (() => undefined),
                isEnabled: registered?.isEnabled,
            };
        };

        if (actionCatalog.length === 0) {
            return commandRegistry.all();
        }

        return actionCatalog.map(fromDescriptor);
    }, [actionCatalog, commandRegistry]);

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

    const runCommand = useCallback(
        (actionId: ActionId) => {
            setOpen(false);
            setQuery("");
            void dispatchAction({ id: actionId, payload: null });
        },
        [dispatchAction],
    );

    return {
        filteredCommands,
        runCommand,
    };
};
