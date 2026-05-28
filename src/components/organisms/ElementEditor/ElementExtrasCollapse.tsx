import { useState, type ReactNode } from "react";
import {
    ChevronDown24Regular,
    ChevronUp24Regular,
} from "@fluentui/react-icons";
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
                    <button
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
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                    >
                        {open ? (
                            <ChevronUp24Regular />
                        ) : (
                            <ChevronDown24Regular />
                        )}
                    </button>
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
