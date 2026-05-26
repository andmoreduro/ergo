import type { RichText } from "../bindings/RichText";
import { isReferenceSpan } from "../richText/richText";

/** Collapse runs of two or more spaces into a single space. */
export const collapseConsecutiveSpaces = (text: string): string =>
    text.replace(/ {2,}/g, " ");

/** Normalize text entered in plain fields before compare or commit. */
export const normalizeEditableText = (text: string): string =>
    collapseConsecutiveSpaces(text);

export const normalizeRichTextContent = (content: RichText[]): RichText[] =>
    content.map((span) =>
        isReferenceSpan(span)
            ? span
            : { ...span, text: normalizeEditableText(span.text) },
    );
