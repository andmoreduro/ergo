import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { TauriApi } from "../api/tauri";
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
        if (actionCatalog.length === 0) {
            return commandRegistry.all();
        }

        return actionCatalog.map((descriptor) => {
            const command = commandRegistry.get(descriptor.id);
            if (command) {
                return command;
            }

            return {
                id: descriptor.id,
                label: descriptor.id,
                scope: "global",
                isEnabled: () => false,
                run: () => undefined,
            };
        });
    }, [actionCatalog, commandRegistry]);

    const deferredQuery = useDeferredValue(query);
    const filteredCommands = useMemo(
        () =>
            paletteCommands.filter((command) =>
                command.label.toLowerCase().includes(deferredQuery.toLowerCase()),
            ),
        [deferredQuery, paletteCommands],
    );

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
