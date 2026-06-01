import { useRef, type ReactNode } from "react";
import { ElementExtrasAccordion } from "./ElementExtrasAccordion";
import styles from "./ElementEditor.module.css";

export const ElementExtrasCollapse = ({
    primary,
    extras,
    showToggle = true,
    elementId = "",
}: {
    primary: ReactNode;
    extras: ReactNode;
    showToggle?: boolean;
    elementId?: string;
}) => {
    const shellRef = useRef<HTMLDivElement>(null);

    return (
        <div className={styles.extrasShell} ref={shellRef}>
            <div className={styles.extrasPrimary} data-wrapper-tab="primary">
                {primary}
            </div>
            {showToggle ? (
                <ElementExtrasAccordion elementId={elementId} shellRef={shellRef}>
                    {extras}
                </ElementExtrasAccordion>
            ) : null}
        </div>
    );
};
