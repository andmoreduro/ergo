import type { RichText } from "../../bindings/RichText.js";
import type { QuotePolicySpec } from "../../bindings/QuotePolicySpec.js";

export type QuotePolicy = QuotePolicySpec;

export function countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return 0;
    }
    return trimmed.split(/\s+/).filter((word) => word.length > 0).length;
}

export function richTextPlainText(spans: RichText[]): string {
    return spans
        .filter((span) => span.kind == null || span.kind === "text")
        .map((span) => span.text)
        .join("");
}

export function shouldQuoteBeBlock(
    policy: QuotePolicy | null | undefined,
    wordCount: number,
): boolean {
    if (policy == null) {
        return false;
    }
    if (typeof policy === "number") {
        return wordCount >= policy;
    }
    if (policy === "block") {
        return wordCount > 0;
    }
    if (policy === "inline") {
        return false;
    }
    return false;
}

export function shouldInsertQuoteAsBlock(
    policy: QuotePolicy | null | undefined,
): boolean {
    return policy === "block";
}

export type ParagraphQuoteSplit =
    | { kind: "replace"; quoteText: string }
    | {
          kind: "split";
          before: RichText[];
          quoteText: string;
          after: RichText[];
      };

function isQuoteSpan(span: RichText): boolean {
    return span.kind === "quote";
}

function isMeaningfulRichText(spans: RichText[]): boolean {
    return richTextPlainText(spans).trim().length > 0;
}

/**
 * When an inline quote span crosses the template threshold, decide how to
 * reshape the surrounding paragraph.
 */
export function planParagraphQuotePromotion(
    content: RichText[],
    quoteSpanIndex: number,
    policy: QuotePolicy | null | undefined,
): ParagraphQuoteSplit | null {
    const span = content[quoteSpanIndex];
    if (!span || !isQuoteSpan(span)) {
        return null;
    }

    const wordCount = countWords(span.text);
    if (!shouldQuoteBeBlock(policy, wordCount)) {
        return null;
    }

    const before = content.slice(0, quoteSpanIndex);
    const after = content.slice(quoteSpanIndex + 1);
    const quoteText = span.text;

    const hasBefore = isMeaningfulRichText(before);
    const hasAfter = isMeaningfulRichText(after);

    if (!hasBefore && !hasAfter) {
        return { kind: "replace", quoteText };
    }

    return {
        kind: "split",
        before: hasBefore ? before : [],
        quoteText,
        after: hasAfter ? after : [],
    };
}
