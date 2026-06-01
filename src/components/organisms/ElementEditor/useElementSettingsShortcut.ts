import { useEffect, useState } from "react";
import { useBlockUiState } from "../../../editor/prosemirror/blockUiState";

/**
 * Controlled open-state for a block element's settings modal, plus a keyboard
 * shortcut (Ctrl/Cmd+,) that opens it — but only while the block is in
 * fine-grained edit mode, so the chord never fires for a block the user isn't
 * actively editing. Returns the open flag and a setter for the cog button to
 * share, keeping mouse and keyboard on the same control.
 */
export const useElementSettingsShortcut = (elementId: string) => {
    const { editing } = useBlockUiState(elementId);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!editing) {
            // Leaving fine-grained mode closes the modal so it can't linger over
            // an unfocused block.
            setOpen(false);
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
