import { useEffect, type ReactNode } from "react";
import {
    ActionContextProvider,
    useSetFocusedActionContext,
    type ActionHandlerMap,
} from "../runtime";

export interface FocusableActionContextProps {
    id: string;
    contexts: string[];
    attributes?: Record<string, string>;
    handlers?: ActionHandlerMap;
    /** When the surface becomes active it claims focus so its shortcuts resolve
     * without requiring a click. Defaults to true. */
    active?: boolean;
    children: ReactNode;
}

/**
 * Shared wrapper for panel/dialog action contexts: registers an
 * `ActionContextProvider` and claims focused context while `active`. Replaces the
 * copy-pasted `useEffect(() => active && setFocusedContext(id))` boilerplate that
 * previously lived in every context wrapper.
 */
export const FocusableActionContext = ({
    id,
    contexts,
    attributes,
    handlers,
    active = true,
    children,
}: FocusableActionContextProps) => {
    const setFocusedContext = useSetFocusedActionContext();

    useEffect(() => {
        if (active) {
            setFocusedContext(id);
        }
    }, [active, id, setFocusedContext]);

    return (
        <ActionContextProvider
            id={id}
            contexts={contexts}
            attributes={attributes}
            handlers={handlers}
        >
            {children}
        </ActionContextProvider>
    );
};
