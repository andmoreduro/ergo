import { useEffect, useRef, useState } from "react";
import { registerActiveElementSettingsToggle } from "../../../editor/elementSettingsBridge";
import { useBlockUiState } from "../../../editor/prosemirror/blockUiState";

/**
 * Controlled open-state for a block element's settings modal. Ctrl/Cmd+, is
 * handled by the action runtime (`editor::OpenElementSettings`) via
 * {@link registerActiveElementSettingsToggle} while the block is in
 * fine-grained edit mode.
 */
export const useElementSettingsShortcut = (elementId: string) => {
    const { selected, editing } = useBlockUiState(elementId);
    const [open, setOpen] = useState(false);
    const hadBlockFocusRef = useRef(false);

    useEffect(() => {
        const focused = selected || editing;
        if (hadBlockFocusRef.current && !focused) {
            setOpen(false);
        }
        hadBlockFocusRef.current = focused;
    }, [selected, editing]);

    useEffect(() => {
        if (!editing) {
            return undefined;
        }

        return registerActiveElementSettingsToggle(() => {
            setOpen((value) => !value);
        });
    }, [editing]);

    return { open, setOpen };
};
