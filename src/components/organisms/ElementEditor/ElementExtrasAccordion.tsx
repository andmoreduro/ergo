import { type ReactNode, type RefObject } from "react";
import { Accordion } from "../../molecules/Accordion/Accordion";
import { useElementExtrasOpen } from "./useElementExtrasOpen";
import styles from "./ElementEditor.module.css";

export const ElementExtrasAccordion = ({
    elementId,
    shellRef,
    children,
    headerAccessory,
}: {
    elementId: string;
    shellRef: RefObject<HTMLElement | null>;
    children: ReactNode;
    headerAccessory?: ReactNode;
}) => {
    const { open, setOpen, forceOpen, revealOnFocus } = useElementExtrasOpen(
        elementId,
        shellRef,
        styles.extrasPrimary,
    );

    return (
        <Accordion
            variant="element"
            title=""
            open={open}
            onOpenChange={setOpen}
            disableToggle={forceOpen}
            headerAccessory={headerAccessory}
            onContentFocus={revealOnFocus}
        >
            {children}
        </Accordion>
    );
};
