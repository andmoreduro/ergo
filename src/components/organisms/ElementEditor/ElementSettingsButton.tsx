import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
    const anchorRef = useRef<HTMLDivElement>(null);
    const openRef = useRef(open);
    openRef.current = open;
    const onOpenChangeRef = useRef(onOpenChange);
    onOpenChangeRef.current = onOpenChange;

    const setOpen = (next: boolean) => {
        if (onOpenChangeRef.current) {
            onOpenChangeRef.current(next);
        } else {
            setUncontrolledOpen(next);
        }
    };

    // Block NodeViews handle mousedown in the native bubble phase before React
    // delegates at the root. Toggle and stop propagation here so the block is not
    // selected and React does not need to receive the event.
    useEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) {
            return;
        }
        const onPointerDown = (event: PointerEvent) => {
            if (!anchor.contains(event.target as Node)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            setOpen(!openRef.current);
        };
        const stopMouseDownBubble = (event: MouseEvent) => {
            if (!anchor.contains(event.target as Node)) {
                return;
            }
            event.stopPropagation();
        };
        anchor.addEventListener("pointerdown", onPointerDown);
        anchor.addEventListener("mousedown", stopMouseDownBubble);
        return () => {
            anchor.removeEventListener("pointerdown", onPointerDown);
            anchor.removeEventListener("mousedown", stopMouseDownBubble);
        };
    }, []);

    const dialog =
        open &&
        createPortal(
            <Dialog
                size="sm"
                title={m.editor_element_settings_title()}
                titleId={titleId}
                zIndex={3200}
                cancelAction={{
                    label: m.editor_element_settings_cancel(),
                    onClick: () => setOpen(false),
                }}
                confirmAction={{
                    label: m.editor_element_settings_close(),
                    onClick: () => setOpen(false),
                }}
            >
                {children}
            </Dialog>,
            document.body,
        );

    return (
        <div
            ref={anchorRef}
            className={styles.settingsAnchor}
            data-element-settings-chrome
            data-wrapper-tab-ignore
        >
            <IconButton
                data-wrapper-tab-ignore
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={m.editor_element_settings()}
                className={styles.settingsButton}
                title={m.editor_element_settings()}
            >
                <Settings24Regular />
            </IconButton>
            {dialog}
        </div>
    );
};
