import { useEffect } from "react";
import {
    DEFAULT_KEYMAP,
    findCommandForKeyboardEvent,
} from "./keymap";
import type { CommandRegistry } from "./registry";
import type { CommandContext, KeymapProfile } from "./types";

export interface UseKeyboardShortcutsOptions {
    registry: CommandRegistry;
    context: CommandContext;
    keymap?: KeymapProfile;
}

export const useKeyboardShortcuts = ({
    registry,
    context,
    keymap = DEFAULT_KEYMAP,
}: UseKeyboardShortcutsOptions) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const commandId = findCommandForKeyboardEvent(
                event,
                keymap.bindings,
                registry,
                context,
            );

            if (!commandId) {
                return;
            }

            event.preventDefault();
            void registry.run(commandId, context);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [context, keymap, registry]);
};
