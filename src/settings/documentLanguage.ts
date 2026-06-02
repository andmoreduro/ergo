export const DOCUMENT_LOCALES = ["en", "es"] as const;

export type DocumentLocale = (typeof DOCUMENT_LOCALES)[number];

export const isDocumentLocale = (value: string): value is DocumentLocale =>
    DOCUMENT_LOCALES.includes(value as DocumentLocale);

/** Primary language tag from project settings (e.g. `es-MX` → `es`). */
export const normalizeDocumentLanguage = (
    language: string | null | undefined,
): DocumentLocale => {
    const raw = language?.trim();
    if (!raw) {
        return "en";
    }
    const primary = raw.split(/[-_]/)[0]?.toLowerCase() ?? raw.toLowerCase();
    return primary === "es" ? "es" : "en";
};
