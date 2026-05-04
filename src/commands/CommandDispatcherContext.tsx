import { createContext, ReactNode, useContext } from "react";
import type { CommandId } from "./types";

export type CommandDispatcher = (id: CommandId) => void;

const CommandDispatcherContext = createContext<CommandDispatcher | undefined>(
    undefined,
);

export interface CommandDispatcherProviderProps {
    children: ReactNode;
    dispatchCommand: CommandDispatcher;
}

export const CommandDispatcherProvider = ({
    children,
    dispatchCommand,
}: CommandDispatcherProviderProps) => (
    <CommandDispatcherContext.Provider value={dispatchCommand}>
        {children}
    </CommandDispatcherContext.Provider>
);

export const useCommandDispatcher = (): CommandDispatcher => {
    const dispatcher = useContext(CommandDispatcherContext);
    if (!dispatcher) {
        throw new Error(
            "useCommandDispatcher must be used within CommandDispatcherProvider",
        );
    }

    return dispatcher;
};
