import { type ReactNode } from "react";
import { ContextAttributes, ContextNames } from "../actionContexts";
import { FocusableActionContext } from "./FocusableActionContext";

export interface TableSettingsContextProps {
    elementId: string;
    active?: boolean;
    children: ReactNode;
}

export const TableSettingsContext = ({
    elementId,
    active = true,
    children,
}: TableSettingsContextProps) => (
    <FocusableActionContext
        id={`table-settings-${elementId}`}
        contexts={[ContextNames.dialog, ContextNames.element, ContextNames.table]}
        attributes={{
            [ContextAttributes.elementId]: elementId,
            [ContextAttributes.elementKind]: "Table",
            [ContextAttributes.dialogKind]: "table-settings",
        }}
        active={active}
    >
        {children}
    </FocusableActionContext>
);
