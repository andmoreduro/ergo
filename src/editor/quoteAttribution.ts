import type { Quote } from "../bindings/Quote";
import type { RichText } from "../bindings/RichText";

export type QuoteAttributionValue = {
    text: string;
    referenceId: string | null;
};

export type QuoteAttributionMode = "none" | "text" | "reference";

export const quoteAttributionMode = (
    value: QuoteAttributionValue,
): QuoteAttributionMode => {
    if (value.referenceId) {
        return "reference";
    }
    if (value.text.length > 0) {
        return "text";
    }
    return "none";
};

/** Empty or whitespace-only attribution text is stored as null. */
export const quoteAttributionTextForStorage = (text: string): string | null =>
    text.trim() ? text : null;

export const emptyQuoteAttribution = (): QuoteAttributionValue => ({
    text: "",
    referenceId: null,
});

export const normalizeQuoteAttribution = (
    value: QuoteAttributionValue,
): QuoteAttributionValue => {
    if (value.referenceId) {
        return { text: "", referenceId: value.referenceId };
    }
    return { text: value.text, referenceId: null };
};

export const quoteAttributionFromRichText = (
    span: Pick<
        RichText,
        "quote_attribution_text" | "quote_attribution_reference_id"
    >,
): QuoteAttributionValue => {
    const referenceId = span.quote_attribution_reference_id ?? null;
    if (referenceId) {
        return { text: "", referenceId };
    }
    return { text: span.quote_attribution_text ?? "", referenceId: null };
};

export const quoteAttributionFromQuote = (
    quote: Pick<Quote, "attribution_text" | "attribution_reference_id">,
): QuoteAttributionValue => {
    const referenceId = quote.attribution_reference_id ?? null;
    if (referenceId) {
        return { text: "", referenceId };
    }
    return { text: quote.attribution_text ?? "", referenceId: null };
};

export const richTextQuoteAttributionFields = (
    value: QuoteAttributionValue,
): Pick<
    RichText,
    "quote_attribution_text" | "quote_attribution_reference_id"
> => {
    const normalized = normalizeQuoteAttribution(value);
    return {
        quote_attribution_text: normalized.referenceId
            ? null
            : quoteAttributionTextForStorage(normalized.text),
        quote_attribution_reference_id: normalized.referenceId,
    };
};

export const quoteElementAttributionFields = (
    value: QuoteAttributionValue,
): Pick<Quote, "attribution_text" | "attribution_reference_id"> => {
    const normalized = normalizeQuoteAttribution(value);
    return {
        attribution_text: normalized.referenceId
            ? null
            : quoteAttributionTextForStorage(normalized.text),
        attribution_reference_id: normalized.referenceId,
    };
};

export const quoteAttributionFromNodeAttrs = (attrs: {
    attributionText?: unknown;
    attributionReferenceId?: unknown;
}): QuoteAttributionValue => {
    const referenceId = String(attrs.attributionReferenceId ?? "").trim();
    if (referenceId) {
        return { text: "", referenceId };
    }
    return {
        text: String(attrs.attributionText ?? ""),
        referenceId: null,
    };
};

export const quoteNodeAttributionAttrs = (
    element: Pick<Quote, "attribution_text" | "attribution_reference_id">,
): {
    attributionText: string;
    attributionReferenceId: string;
} => {
    const value = quoteAttributionFromQuote(element);
    const fields = quoteElementAttributionFields(value);
    return {
        attributionText: fields.attribution_text ?? "",
        attributionReferenceId: fields.attribution_reference_id ?? "",
    };
};

export const quoteElementFromQuoteNode = (
    node: {
        attrs: {
            elementId: string;
            attributionText?: unknown;
            attributionReferenceId?: unknown;
        };
    },
    content: import("../bindings/RichText").RichText[],
): import("../bindings/Quote").Quote & { type: "Quote" } => ({
    type: "Quote",
    id: node.attrs.elementId,
    content,
    ...quoteElementAttributionFields(quoteAttributionFromNodeAttrs(node.attrs)),
});
