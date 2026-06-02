import { describe, expect, it } from "vitest";
import {
    getOutlineInclude,
    OUTLINE_INCLUDE_OVERRIDE_KEYS,
    plainTemplateOutlineDisabledOverrides,
} from "./templateOverrides";

describe("templateOverrides", () => {
    it("plain template defaults disable all outline includes", () => {
        const settings = {
            paper_size: null,
            language: "en",
            text_font: null,
            math_font: null,
            raw_font: null,
            font_size: 11,
            table_stroke_width: 0.5,
            template_overrides: [],
        };
        const templateDefaults = plainTemplateOutlineDisabledOverrides();
        expect(
            getOutlineInclude(
                settings,
                OUTLINE_INCLUDE_OVERRIDE_KEYS.contents,
                templateDefaults,
            ),
        ).toBe(false);
        expect(
            getOutlineInclude(
                settings,
                OUTLINE_INCLUDE_OVERRIDE_KEYS.figures,
                templateDefaults,
            ),
        ).toBe(false);
    });

    it("project override true enables outline on plain template", () => {
        const settings = {
            paper_size: null,
            language: "en",
            text_font: null,
            math_font: null,
            raw_font: null,
            font_size: 11,
            table_stroke_width: 0.5,
            template_overrides: [{ key: "outline.include_figures", value: "true" }],
        };
        expect(
            getOutlineInclude(
                settings,
                OUTLINE_INCLUDE_OVERRIDE_KEYS.figures,
                plainTemplateOutlineDisabledOverrides(),
            ),
        ).toBe(true);
    });
});
