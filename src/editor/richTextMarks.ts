import type { RichText } from "../bindings/RichText";
import { createRichText } from "../state/ast/defaults";
import { richTextToPlainText } from "../richText/richText";

export type RichTextMark = "bold" | "italic" | "underline";

const commandForMark: Record<RichTextMark, string> = {
    bold: "bold",
    italic: "italic",
    underline: "underline",
};

export const parseInputRichText = (value: unknown): RichText[] => {
    if (Array.isArray(value)) {
        return value as RichText[];
    }
    if (typeof value === "string") {
        return value.length > 0 ? [createRichText(value)] : [];
    }
    return [];
};

export const inputRichTextPlain = (value: unknown): string => {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        return richTextToPlainText(value as RichText[]);
    }
    return "";
};

export const applyRichTextMarkToFocusedField = (
    mark: RichTextMark,
    fieldId: string | null,
): boolean => {
    if (!fieldId) {
        return false;
    }

    const field = document.querySelector<HTMLDivElement>(
        `[data-editor-field-id="${CSS.escape(fieldId)}"][contenteditable="true"]`,
    );
    if (!field) {
        return false;
    }

    field.focus();
    document.execCommand(commandForMark[mark]);
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return true;
};
