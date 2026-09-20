import { describe, expect, it } from "vitest";
import { defaultOutlineTitle, effectiveOutlineTitle } from "./outlineDefaults";

const KINDS = [
    "contents",
    "tables",
    "figures",
    "equations",
    "listings",
    "appendices",
] as const;

describe("outlineDefaults", () => {
    it("routes es regional tags to the Spanish default table", () => {
        for (const kind of KINDS) {
            expect(defaultOutlineTitle("es-MX", kind)).toBe(
                defaultOutlineTitle("es", kind),
            );
        }
    });

    it("routes unknown or missing languages to the English defaults", () => {
        for (const kind of KINDS) {
            expect(defaultOutlineTitle("de", kind)).toBe(
                defaultOutlineTitle("en", kind),
            );
            expect(defaultOutlineTitle(null, kind)).toBe(
                defaultOutlineTitle("en", kind),
            );
        }
    });

    it("keeps the Spanish and English tables distinct", () => {
        expect(KINDS.map((kind) => defaultOutlineTitle("es", kind))).not.toEqual(
            KINDS.map((kind) => defaultOutlineTitle("en", kind)),
        );
    });

    it("prefers template override over document language default", () => {
        expect(
            effectiveOutlineTitle(
                {
                    paper_size: null,
                    language: "es",
                    text_font: null,
                    math_font: null,
                    raw_font: null,
                    font_size: 11,
                    table_stroke_width: 0.5,
                    template_overrides: [
                        { key: "outline.figures_title", value: "Illustrations" },
                    ],
                },
                "figures",
            ),
        ).toBe("Illustrations");
    });
});
