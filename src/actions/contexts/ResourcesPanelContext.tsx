import { type ReactNode } from "react";
import { ContextNames } from "../actionContexts";
import { FocusableActionContext } from "./FocusableActionContext";

export interface ResourcesPanelContextProps {
    active?: boolean;
    children: ReactNode;
}

export const ResourcesPanelContext = ({
    active = true,
    children,
}: ResourcesPanelContextProps) => (
    <FocusableActionContext
        id="sidebar-resources"
        contexts={[ContextNames.resources]}
        active={active}
    >
        {children}
    </FocusableActionContext>
);
