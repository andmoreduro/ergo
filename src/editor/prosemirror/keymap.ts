import { keymap } from "prosemirror-keymap";
import { mergeCells, splitCell } from "prosemirror-tables";

/** Merge/split chords only; navigation uses the action runtime. */
export const tableKeymap = keymap({
    "Mod-Shift-m": mergeCells,
    "Mod-Shift-s": splitCell,
});
