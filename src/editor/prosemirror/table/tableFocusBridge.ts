import type { DocumentFocusInput } from "../../../state/DocumentContext";

export type TableFocusPush = (
    focus: Pick<DocumentFocusInput, "elementId" | "fieldId" | "caretUtf16Offset">,
) => void;

let pushTableFocus: TableFocusPush | null = null;

export const setTableFocusPush = (push: TableFocusPush | null): void => {
    pushTableFocus = push;
};

export const getTableFocusPush = (): TableFocusPush | null => pushTableFocus;
