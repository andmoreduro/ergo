import { useCallback, useEffect, useState, type RefObject } from "react";
import { useBlockUiState } from "../../../editor/prosemirror/blockUiState";

const FOCUSABLE_TAGS = [
    "input",
    "textarea",
    "select",
    "button",
    "[contenteditable]",
];

export const useElementExtrasOpen = (
    elementId: string,
    shellRef: RefObject<HTMLElement | null>,
    extrasPrimaryClass: string,
) => {
    const { selected, editing } = useBlockUiState(elementId);
    const [manualOpen, setManualOpen] = useState(false);

    useEffect(() => {
        setManualOpen(selected || editing);
    }, [selected, editing]);

    const forceOpen = selected && !editing;
    const open = forceOpen ? true : manualOpen;

    const setOpen = useCallback(
        (next: boolean) => {
            if (forceOpen && !next) {
                return;
            }
            setManualOpen((prev) => {
                if (prev === next) {
                    return prev;
                }
                if (!next) {
                    const shell = shellRef.current;
                    const active = document.activeElement;
                    if (
                        shell &&
                        active instanceof HTMLElement &&
                        shell.contains(active)
                    ) {
                        const primarySelector = FOCUSABLE_TAGS.map(
                            (tag) => `.${extrasPrimaryClass} ${tag}`,
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
        },
        [forceOpen, shellRef, extrasPrimaryClass],
    );

    const revealOnFocus = useCallback(() => {
        setManualOpen(true);
    }, []);

    return { open, setOpen, forceOpen, revealOnFocus };
};
