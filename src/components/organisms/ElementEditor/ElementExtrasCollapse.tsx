import { useState, type ReactNode } from "react";
import {
    ChevronDown24Regular,
    ChevronUp24Regular,
} from "@fluentui/react-icons";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { m } from "../../../paraglide/messages.js";
import styles from "./ElementEditor.module.css";

export const ElementExtrasCollapse = ({
    primary,
    extras,
    showToggle = true,
}: {
    primary: ReactNode;
    extras: ReactNode;
    showToggle?: boolean;
}) => {
    const [open, setOpen] = useState(false);

    return (
        <div className={styles.extrasShell}>
            <div className={styles.extrasPrimary}>
                {showToggle ? (
                    <IconButton
                        variant="extras"
                        aria-expanded={open}
                        aria-label={
                            open
                                ? m.editor_element_hide_extras()
                                : m.editor_element_show_extras()
                        }
                        className={styles.extrasToggle}
                        title={
                            open
                                ? m.editor_element_hide_extras()
                                : m.editor_element_show_extras()
                        }
                        onClick={() => setOpen((value) => !value)}
                    >
                        {open ? (
                            <ChevronUp24Regular />
                        ) : (
                            <ChevronDown24Regular />
                        )}
                    </IconButton>
                ) : null}
                {primary}
            </div>
            {showToggle ? (
                <div
                    className={`${styles.extrasReveal} ${open ? styles.extrasRevealOpen : ""}`}
                    aria-hidden={!open}
                >
                    <div className={styles.extrasRevealInner}>{extras}</div>
                </div>
            ) : null}
        </div>
    );
};
