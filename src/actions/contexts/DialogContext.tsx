import { type ReactNode } from "react";
import { ContextAttributes, ContextNames } from "../actionContexts";
import { FocusableActionContext } from "./FocusableActionContext";

export interface DialogContextProps {
    id: string;
    kind: string;
    active?: boolean;
    children: ReactNode;
}

export const DialogContext = ({
    id,
    kind,
    active = true,
    children,
}: DialogContextProps) => (
    <FocusableActionContext
        id={id}
        contexts={[ContextNames.dialog]}
        attributes={{ [ContextAttributes.dialogKind]: kind }}
        active={active}
    >
        {children}
    </FocusableActionContext>
);
