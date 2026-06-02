import { useEffect, useRef, useState } from "react";
import { useBlockUiState } from "../../../editor/prosemirror/blockUiState";

/**
 * Controlled open-state for a block element's settings modal, plus a keyboard
 * shortcut (Ctrl/Cmd+,) that opens it — but only while the block is in
 * fine-grained edit mode, so the chord never fires for a block the user isn't
 * actively editing. Returns the open flag and a setter for the cog button to
 * share, keeping mouse and keyboard on the same control.
 */
export const useElementSettingsShortcut = (elementId: string) => {
    const { selected, editing } = useBlockUiState(elementId);
    const [open, setOpen] = useState(false);
    const hadBlockFocusRef = useRef(false);

    useEffect(() => {
        const focused = selected || editing;
        // Close only after the block was focused and then lost focus — not when
        // opening from the cog while the block is still unfocused.
        if (hadBlockFocusRef.current && !focused) {
            setOpen(false);
        }
        hadBlockFocusRef.current = focused;
    }, [selected, editing]);

    useEffect(() => {
        if (!editing) {
            return;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === ",") {
                event.preventDefault();
                event.stopPropagation();
                setOpen((value) => !value);
            }
        };
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [editing]);

    return { open, setOpen };
};
