import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChipConfigTrigger } from "../../atoms/ChipConfigTrigger/ChipConfigTrigger";
import { Dialog } from "../Dialog/Dialog";
import { m } from "../../../paraglide/messages.js";
import styles from "./InlineChipConfig.module.css";

export interface InlineChipConfigProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
}

/**
 * Settings cog anchored on an inline chip. Opens a modal for secondary fields
 * (syntax, placement, etc.) while the chip keeps the primary editable value.
 */
export const InlineChipConfig = ({
    open,
    onOpenChange,
    children,
}: InlineChipConfigProps) => {
    const titleId = useId();
    const anchorRef = useRef<HTMLSpanElement>(null);
    const openRef = useRef(open);
    openRef.current = open;

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
            onOpenChange(!openRef.current);
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
    }, [onOpenChange]);

    const close = () => onOpenChange(false);

    return (
        <>
            <span
                ref={anchorRef}
                className={styles.anchor}
                data-element-settings-chrome
                data-wrapper-tab-ignore
            >
                <ChipConfigTrigger
                    type="button"
                    className={styles.trigger}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-label={m.editor_element_settings()}
                    title={m.editor_element_settings()}
                />
            </span>
            {open
                ? createPortal(
                      <Dialog
                          size="sm"
                          title={m.editor_element_settings_title()}
                          titleId={titleId}
                          zIndex={3200}
                          cancelAction={{
                              label: m.editor_element_settings_cancel(),
                              onClick: close,
                          }}
                          confirmAction={{
                              label: m.editor_element_settings_close(),
                              onClick: close,
                          }}
                      >
                          {children}
                      </Dialog>,
                      document.body,
                  )
                : null}
        </>
    );
};
