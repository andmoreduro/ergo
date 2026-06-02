import { describe, expect, it } from "vitest";
import { defaultOutlineTitle, effectiveOutlineTitle } from "./outlineDefaults";

describe("outlineDefaults", () => {
    it("uses Spanish defaults for document language es", () => {
        expect(defaultOutlineTitle("es", "tables")).toBe("Tablas");
        expect(defaultOutlineTitle("es-MX", "figures")).toBe("Figuras");
    });

    it("uses English defaults for unknown document language", () => {
        expect(defaultOutlineTitle("de", "listings")).toBe("Listings");
        expect(defaultOutlineTitle(null, "contents")).toBe("Contents");
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
