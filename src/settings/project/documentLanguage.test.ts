import { describe, expect, it } from "vitest";
import { isDocumentLocale, normalizeDocumentLanguage } from "./documentLanguage";

describe("documentLanguage", () => {
    it("normalizes regional tags to en or es", () => {
        expect(normalizeDocumentLanguage("es-MX")).toBe("es");
        expect(normalizeDocumentLanguage("en-US")).toBe("en");
        expect(normalizeDocumentLanguage(null)).toBe("en");
    });

    it("accepts only en and es as document locales", () => {
        expect(isDocumentLocale("en")).toBe(true);
        expect(isDocumentLocale("es")).toBe(true);
        expect(isDocumentLocale("de")).toBe(false);
    });
});
