import type { RichText } from "../bindings/RichText";
import { richTextPlainLength } from "../richText/richText";

/** Backend source-map id for one paragraph of a `content_blocks` input, e.g. `/abstract_es/2`. */
const INDEXED_INPUT_FIELD = /^(\/[^/]+)\/(\d+)$/;

export const parseIndexedInputFieldPath = (
    fieldId: string,
): { basePath: string; paragraphIndex: number } | null => {
    const match = fieldId.match(INDEXED_INPUT_FIELD);
    if (!match) {
        return null;
    }
    return { basePath: match[1], paragraphIndex: Number(match[2]) };
};

/** Plain-text caret offset across all paragraphs in a `ParagraphsField`. */
export const globalCaretInContentBlocks = (
    paragraphs: readonly RichText[][],
    paragraphIndex: number,
    localCaret: number,
): number => {
    let offset = 0;
    for (let index = 0; index < paragraphIndex && index < paragraphs.length; index += 1) {
        offset += richTextPlainLength(paragraphs[index] ?? []);
    }
    return offset + Math.max(0, localCaret);
};

export const localCaretInContentBlocks = (
    paragraphs: readonly RichText[][],
    globalCaret: number,
): { paragraphIndex: number; localCaret: number } => {
    let remaining = Math.max(0, globalCaret);

    for (let index = 0; index < paragraphs.length; index += 1) {
        const length = richTextPlainLength(paragraphs[index] ?? []);
        if (remaining <= length || index === paragraphs.length - 1) {
            return {
                paragraphIndex: index,
                localCaret: Math.min(remaining, length),
            };
        }
        remaining -= length;
    }

    return { paragraphIndex: 0, localCaret: 0 };
};
