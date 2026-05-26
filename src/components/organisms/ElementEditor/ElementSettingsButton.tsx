import { useId, useState, type ReactNode } from "react";
import { Settings24Regular } from "@fluentui/react-icons";
import { m } from "../../../paraglide/messages.js";
import styles from "./ElementEditor.module.css";

export const ElementSettingsButton = ({
    children,
}: {
    children: ReactNode;
}) => {
    const [open, setOpen] = useState(false);
    const panelId = useId();

    return (
        <div className={styles.settingsAnchor}>
            <button
                aria-controls={panelId}
                aria-expanded={open}
                aria-label={m.editor_element_settings()}
                className={styles.settingsButton}
                title={m.editor_element_settings()}
                type="button"
                onClick={() => setOpen((value) => !value)}
            >
                <Settings24Regular />
            </button>
            {open ? (
                <div className={styles.settingsPanel} id={panelId} role="region">
                    {children}
                </div>
            ) : null}
        </div>
    );
};

