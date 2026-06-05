import { useState, type ReactNode } from "react";
import { ContextAttributes, ContextNames } from "../actionContexts";
import { FocusableActionContext } from "./FocusableActionContext";

export interface CoverPageFieldContextProps {
    fieldId: string;
    children: ReactNode;
}

export const CoverPageFieldContext = ({
    fieldId,
    children,
}: CoverPageFieldContextProps) => {
    const [active, setActive] = useState(false);

    return (
        <FocusableActionContext
            id={`cover-page-${fieldId}`}
            contexts={[ContextNames.coverPage, ContextNames.input]}
            attributes={{ [ContextAttributes.elementId]: fieldId }}
            active={active}
        >
            <div
                onFocusCapture={() => setActive(true)}
                onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setActive(false);
                    }
                }}
            >
                {children}
            </div>
        </FocusableActionContext>
    );
};
