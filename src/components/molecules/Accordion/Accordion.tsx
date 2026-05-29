import { useState, memo } from "react";
import { DisclosureButton } from "../../atoms/DisclosureButton/DisclosureButton";
import styles from "./Accordion.module.css";

export interface AccordionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

export const Accordion = memo(({
    title,
    children,
    defaultOpen = false,
}: AccordionProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={styles.container}>
            <DisclosureButton
                title={title}
                open={isOpen}
                onClick={() => setIsOpen((prev) => !prev)}
            />
            {isOpen ? <div className={styles.content}>{children}</div> : null}
        </div>
    );
});

Accordion.displayName = "Accordion";
