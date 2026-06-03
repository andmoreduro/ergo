import type { RichText } from "../bindings/RichText";
import { createRichText } from "../state/ast/defaults";
import { richTextSignificantlyEqual } from "../state/ast/commitPolicy";
import { richTextToPlainText } from "../richText/richText";
import { parseInputRichText } from "./richTextMarks";
import { normalizeRichTextContent } from "./textInput";

/**
 * Parse a stored `content_blocks` value into paragraphs (`RichText[][]`).
 *
 * Migrates legacy values: a single-paragraph `RichText[]` (from a field that used
 * to be plain `content`) becomes one paragraph; a plain string becomes one
 * paragraph; anything else becomes a single empty paragraph.
 */
export const parseInputContentBlocks = (value: unknown): RichText[][] => {
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return [[]];
        }
        // Array of paragraphs (`RichText[][]`).
        if (Array.isArray(value[0])) {
            return value.map((paragraph) => parseInputRichText(paragraph));
        }
        // Legacy single-paragraph `RichText[]`.
        return [value as RichText[]];
    }
    if (typeof value === "string" && value.length > 0) {
        return [[createRichText(value)]];
    }
    return [[]];
};

export const normalizeContentBlocks = (paragraphs: RichText[][]): RichText[][] =>
    paragraphs.map((paragraph) => normalizeRichTextContent(paragraph));

/** Drop trailing empty paragraphs (keep at least one) so storage stays tidy. */
export const finalizeContentBlocks = (paragraphs: RichText[][]): RichText[][] => {
    const normalized = normalizeContentBlocks(paragraphs);
    let end = normalized.length;
    while (end > 1 && richTextToPlainText(normalized[end - 1] ?? []).length === 0) {
        end -= 1;
    }
    return normalized.slice(0, end);
};

export const contentBlocksSignificantlyEqual = (
    a: RichText[][],
    b: RichText[][],
): boolean => {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((paragraph, index) =>
        richTextSignificantlyEqual(paragraph, b[index] ?? []),
    );
};
