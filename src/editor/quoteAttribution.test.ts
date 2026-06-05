import { describe, expect, it } from "vitest";
import {
    normalizeQuoteAttribution,
    quoteAttributionFromRichText,
    richTextQuoteAttributionFields,
} from "./quoteAttribution";

describe("quoteAttribution", () => {
    it("keeps text or reference mutually exclusive", () => {
        expect(
            normalizeQuoteAttribution({
                text: "(Smith, 2020)",
                referenceId: "ref-1",
            }),
        ).toEqual({ text: "", referenceId: "ref-1" });

        expect(
            richTextQuoteAttributionFields({
                text: "(Smith, 2020)",
                referenceId: null,
            }),
        ).toEqual({
            quote_attribution_text: "(Smith, 2020)",
            quote_attribution_reference_id: null,
        });
    });

    it("reads inline quote attribution from rich text", () => {
        expect(
            quoteAttributionFromRichText({
                quote_attribution_text: null,
                quote_attribution_reference_id: "ref-1",
            }),
        ).toEqual({ text: "", referenceId: "ref-1" });
    });
});
