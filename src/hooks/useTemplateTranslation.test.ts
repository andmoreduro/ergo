import { describe, expect, it, vi } from "vitest";
import { useTemplateTranslation } from "./useTemplateTranslation";
import type { TemplateSpec } from "../bindings/TemplateSpec";

// Mock paraglide getLocale
let mockLocale = "en";
vi.mock("../paraglide/runtime.js", () => ({
    getLocale: () => mockLocale,
}));

describe("useTemplateTranslation", () => {
    const dummySpec: TemplateSpec = {
        metadata: {
            id: "test",
            name: "Test",
            version: "1.0.0",
            description: null,
        },
        typst: {
            package: { name: "test", version: "1.0.0", imports: [], dependencies: [] },
            show_rule: null,
            sections: [],
            element_overrides: null,
            resource_policy: null,
            default_template_overrides: [],
        },
        editor: {
            inputs: [],
            groups: [],
            variants: [],
            custom_elements: [],
            defaults: null,
            quote_policy: null,
            options: [],
        },
        messages: {
            es: {
                "Student paper": "Trabajo de estudiante",
                "Document Title": "Título del Documento",
            },
            en: {
                "Student paper": "Student Paper",
            },
        },
    };

    it("falls back to the key if spec is null or has no messages", () => {
        mockLocale = "es";
        const t = useTemplateTranslation(null);
        expect(t("Student paper")).toBe("Student paper");
    });

    it("translates key exactly matching locale", () => {
        mockLocale = "es";
        const t = useTemplateTranslation(dummySpec);
        expect(t("Student paper")).toBe("Trabajo de estudiante");
    });

    it("falls back to base language if exact locale match is missing", () => {
        mockLocale = "es-CO";
        const t = useTemplateTranslation(dummySpec);
        expect(t("Student paper")).toBe("Trabajo de estudiante");
    });

    it("falls back to English if active language translation is missing", () => {
        mockLocale = "fr";
        const t = useTemplateTranslation(dummySpec);
        // "Student paper" is in "en", so fallback to en
        expect(t("Student paper")).toBe("Student Paper");
    });

    it("returns the key itself if no translation is defined (first-class raw strings support)", () => {
        mockLocale = "fr";
        const t = useTemplateTranslation(dummySpec);
        expect(t("Custom Raw Label")).toBe("Custom Raw Label");
    });
});
