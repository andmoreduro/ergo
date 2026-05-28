import type { RichText } from "../bindings/RichText";
import { richTextToPlainText } from "../richText/richText";
import { createRichText } from "../state/ast/defaults";
import { normalizeRichTextContent } from "./textInput";
import { parseInputRichText } from "./richTextMarks";

export const parseSimpleListContentItems = (value: unknown): RichText[][] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((item) => parseInputRichText(item));
};

export const isSimpleListContentEmpty = (content: RichText[]): boolean =>
    !richTextToPlainText(content).trim();

export const normalizeSimpleListContentItem = (
    content: RichText[],
): RichText[] => normalizeRichTextContent(content);

export const finalizeSimpleListContentItem = (
    content: RichText[],
): RichText[] => {
    const normalized = normalizeSimpleListContentItem(content);
    return isSimpleListContentEmpty(normalized) ? [] : normalized;
};

export const emptySimpleListContentItem = (): RichText[] => [createRichText("")];
