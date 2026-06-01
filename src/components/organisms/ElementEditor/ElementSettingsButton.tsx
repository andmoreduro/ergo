import { useId, useState, type ReactNode } from "react";
import { Settings24Regular } from "@fluentui/react-icons";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { Dialog } from "../../molecules/Dialog/Dialog";
import { m } from "../../../paraglide/messages.js";
import styles from "./ElementEditor.module.css";

/**
 * Cog button that opens the element's settings in a modal dialog (height, width,
 * placement, and any element-specific extras passed as children). Replaces the
 * former inline dropdown so settings are presented consistently across figures,
 * images, diagrams, and tables.
 */
export const ElementSettingsButton = ({
    children,
    open: controlledOpen,
    onOpenChange,
}: {
    children: ReactNode;
    /** Optional controlled open state (e.g. a keyboard shortcut in edit mode). */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) => {
    const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
    const open = controlledOpen ?? uncontrolledOpen;
    const titleId = useId();

    const setOpen = (next: boolean) => {
        if (onOpenChange) {
            onOpenChange(next);
        } else {
            setUncontrolledOpen(next);
        }
    };

    return (
        <div className={styles.settingsAnchor} data-wrapper-tab-ignore>
            <IconButton
                data-wrapper-tab-ignore
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={m.editor_element_settings()}
                className={styles.settingsButton}
                title={m.editor_element_settings()}
                onClick={() => setOpen(!open)}
            >
                <Settings24Regular />
            </IconButton>
            {open ? (
                <Dialog
                    closeLabel={m.editor_element_settings_close()}
                    closeVariant="ghost"
                    size="sm"
                    title={m.editor_element_settings_title()}
                    titleId={titleId}
                    zIndex={2100}
                    onClose={() => setOpen(false)}
                    onBackdropClick={() => setOpen(false)}
                >
                    {children}
                </Dialog>
            ) : null}
        </div>
    );
};
