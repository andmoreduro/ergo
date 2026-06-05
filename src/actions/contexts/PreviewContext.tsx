import { type ReactNode } from "react";
import { ContextNames } from "../actionContexts";
import { FocusableActionContext } from "./FocusableActionContext";

export interface PreviewContextProps {
    active?: boolean;
    children: ReactNode;
}

export const PreviewContext = ({
    active = true,
    children,
}: PreviewContextProps) => (
    <FocusableActionContext
        id="preview-pane"
        contexts={[ContextNames.preview]}
        active={active}
    >
        {children}
    </FocusableActionContext>
);
