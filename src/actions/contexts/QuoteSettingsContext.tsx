import { type ReactNode } from "react";
import { ContextAttributes, ContextNames } from "../actionContexts";
import { FocusableActionContext } from "./FocusableActionContext";

export interface QuoteSettingsContextProps {
    inline: boolean;
    active?: boolean;
    children: ReactNode;
}

export const QuoteSettingsContext = ({
    inline,
    active = true,
    children,
}: QuoteSettingsContextProps) => (
    <FocusableActionContext
        id={inline ? "quote-settings-inline" : "quote-settings-block"}
        contexts={[ContextNames.dialog, ContextNames.quote]}
        attributes={{
            [ContextAttributes.quoteInline]: inline ? "true" : "false",
            [ContextAttributes.dialogKind]: "quote-settings",
        }}
        active={active}
    >
        {children}
    </FocusableActionContext>
);
