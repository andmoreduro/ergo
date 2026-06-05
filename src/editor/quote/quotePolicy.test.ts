import { describe, expect, it } from "vitest";
import type { RichText } from "../../bindings/RichText.js";
import {
    countWords,
    planParagraphQuotePromotion,
    shouldInsertQuoteAsBlock,
    shouldQuoteBeBlock,
} from "./quotePolicy.js";

function quoteSpan(text: string): RichText {
    return { text, kind: "quote", equation_syntax: "typst" };
}

function textSpan(text: string): RichText {
    return { text, equation_syntax: "typst" };
}

describe("countWords", () => {
    it("matches whitespace-separated word counts", () => {
        expect(countWords("one two three")).toBe(3);
        expect(countWords("  spaced   words  ")).toBe(2);
        expect(countWords("")).toBe(0);
    });
});

describe("shouldQuoteBeBlock", () => {
    it("uses APA-style 40-word threshold", () => {
        expect(shouldQuoteBeBlock(40, 39)).toBe(false);
        expect(shouldQuoteBeBlock(40, 40)).toBe(true);
    });

    it("supports block and inline modes", () => {
        expect(shouldQuoteBeBlock("block", 1)).toBe(true);
        expect(shouldQuoteBeBlock("block", 0)).toBe(false);
        expect(shouldQuoteBeBlock("inline", 100)).toBe(false);
    });
});

describe("shouldInsertQuoteAsBlock", () => {
    it("is true only for explicit block policy", () => {
        expect(shouldInsertQuoteAsBlock("block")).toBe(true);
        expect(shouldInsertQuoteAsBlock(40)).toBe(false);
        expect(shouldInsertQuoteAsBlock("inline")).toBe(false);
        expect(shouldInsertQuoteAsBlock(null)).toBe(false);
    });
});

describe("planParagraphQuotePromotion", () => {
    it("replaces the paragraph when the quote is the only content", () => {
        const content = [quoteSpan("word ".repeat(40).trim())];
        const plan = planParagraphQuotePromotion(content, 0, 40);
        expect(plan).toEqual({
            kind: "replace",
            quoteText: content[0].text,
        });
    });

    it("splits around a long quote with prose on both sides", () => {
        const longQuote = "word ".repeat(40).trim();
        const content = [
            textSpan("Before. "),
            quoteSpan(longQuote),
            textSpan(" After."),
        ];
        const plan = planParagraphQuotePromotion(content, 1, 40);
        expect(plan).toEqual({
            kind: "split",
            before: [textSpan("Before. ")],
            quoteText: longQuote,
            after: [textSpan(" After.")],
        });
    });

    it("omits empty sides when only trailing prose exists", () => {
        const longQuote = "word ".repeat(40).trim();
        const content = [quoteSpan(longQuote), textSpan("After only.")];
        const plan = planParagraphQuotePromotion(content, 0, 40);
        expect(plan).toEqual({
            kind: "split",
            before: [],
            quoteText: longQuote,
            after: [textSpan("After only.")],
        });
    });

    it("returns null when the quote stays inline", () => {
        const content = [textSpan("Intro "), quoteSpan("short quote")];
        expect(planParagraphQuotePromotion(content, 1, 40)).toBeNull();
    });
});
