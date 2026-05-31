import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    ChevronDown24Regular,
    ChevronUp24Regular,
} from "@fluentui/react-icons";
import { IconButton } from "../../atoms/IconButton/IconButton";
import { useBlockUiState } from "../../../editor/prosemirror/blockUiState";
import { m } from "../../../paraglide/messages.js";
import styles from "./ElementEditor.module.css";

const FOCUSABLE_TAGS = [
    "input",
    "textarea",
    "select",
    "button",
    "[contenteditable]",
];

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
    const { selected, editing } = useBlockUiState(elementId);
    const [manualOpen, setManualOpen] = useState(false);
    const shellRef = useRef<HTMLDivElement>(null);

    // Reveal the extras whenever the block becomes focused/edited, and collapse
    // them again once it is neither ("until the user moves on").
    useEffect(() => {
        setManualOpen(selected || editing);
    }, [selected, editing]);

    // A selected-but-locked block keeps its extras pinned open (the user can't
    // hide them); in fine-grained mode they may be toggled shut.
    const forceOpen = selected && !editing;
    const open = forceOpen ? true : manualOpen;

    const handleToggle = useCallback(() => {
        if (forceOpen) {
            return;
        }
        setManualOpen((value) => {
            const next = !value;
            // Collapsing while the caret sits in a now-hidden extra field would
            // strand focus; move it back to the first visible (primary) control.
            if (!next) {
                const shell = shellRef.current;
                const active = document.activeElement;
                if (
                    shell &&
                    active instanceof HTMLElement &&
                    shell.contains(active)
                ) {
                    const primarySelector = FOCUSABLE_TAGS.map(
                        (tag) => `.${styles.extrasPrimary} ${tag}`,
                    ).join(", ");
                    requestAnimationFrame(() => {
                        shell
                            .querySelector<HTMLElement>(primarySelector)
                            ?.focus();
                    });
                }
            }
            return next;
        });
    }, [forceOpen]);

    // Tab/click focus landing in a collapsed extra reveals the panel so the
    // focused field becomes visible.
    const handleRevealFocus = useCallback(() => {
        setManualOpen(true);
    }, []);

    return (
        <div className={styles.extrasShell} ref={shellRef}>
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
                        onClick={handleToggle}
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
                    onFocus={handleRevealFocus}
                >
                    <div className={styles.extrasRevealInner}>{extras}</div>
                </div>
            ) : null}
        </div>
    );
};
