import { type ReactNode } from "react";
import { ContextNames } from "../actionContexts";
import { FocusableActionContext } from "./FocusableActionContext";

export interface BibliographyPanelContextProps {
    active?: boolean;
    children: ReactNode;
}

export const BibliographyPanelContext = ({
    active = true,
    children,
}: BibliographyPanelContextProps) => (
    <FocusableActionContext
        id="sidebar-bibliography"
        contexts={[ContextNames.bibliography]}
        active={active}
    >
        {children}
    </FocusableActionContext>
);
