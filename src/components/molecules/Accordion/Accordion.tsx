import { useState, memo, type ReactNode } from "react";
import { DisclosureButton } from "../../atoms/DisclosureButton/DisclosureButton";
import styles from "./Accordion.module.css";

export interface AccordionProps {
    title: string;
    children: ReactNode;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    variant?: "sidebar" | "element";
    headerAccessory?: ReactNode;
    disableToggle?: boolean;
    className?: string;
    contentClassName?: string;
    onContentFocus?: () => void;
}

export const Accordion = memo(({
    title,
    children,
    defaultOpen = false,
    open: openProp,
    onOpenChange,
    variant = "sidebar",
    headerAccessory,
    disableToggle = false,
    className = "",
    contentClassName = "",
    onContentFocus,
}: AccordionProps) => {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const controlled = openProp !== undefined;
    const isOpen = controlled ? openProp : internalOpen;

    const setOpen = (next: boolean) => {
        if (disableToggle && !next) {
            return;
        }
        if (!controlled) {
            setInternalOpen(next);
        }
        onOpenChange?.(next);
    };

    const containerClass = [
        styles.container,
        variant === "element" ? styles.element : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    const contentClass = [
        styles.content,
        variant === "element" ? styles.elementContent : "",
        contentClassName,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={containerClass}>
            <div
                className={
                    headerAccessory ? styles.headerRow : styles.headerSingle
                }
            >
                <DisclosureButton
                    data-wrapper-tab-ignore
                    title={title}
                    open={isOpen}
                    variant={variant}
                    className={
                        variant === "element" || headerAccessory
                            ? styles.headerTrigger
                            : ""
                    }
                    disabled={disableToggle}
                    onClick={() => setOpen(!isOpen)}
                />
                {headerAccessory ? (
                    <div className={styles.headerAccessory}>{headerAccessory}</div>
                ) : null}
            </div>
            {isOpen ? (
                <div
                    className={contentClass}
                    onFocus={onContentFocus}
                >
                    {children}
                </div>
            ) : null}
        </div>
    );
});

Accordion.displayName = "Accordion";
