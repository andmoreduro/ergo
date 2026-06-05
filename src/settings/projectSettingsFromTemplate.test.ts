import { describe, expect, it } from "vitest";

import type { TemplateSpec } from "../bindings/TemplateSpec";
import {
    applyDefaultsSpec,
    defaultTemplateVariantId,
    FALLBACK_PROJECT_SETTINGS,
    projectSettingsFromTemplate,
} from "./projectSettingsFromTemplate";

const apa7LikeSpec = {
    editor: {
        defaults: {
            paper_size: "us-letter",
            language: "en",
            text_font: "Libertinus Serif",
            math_font: "Libertinus Math",
            raw_font: "DejaVu Sans Mono",
            font_size: 12,
            table_stroke_width: 0.5,
        },
        variants: [
            { id: "student", label: "Student", default: true },
            { id: "professional", label: "Professional", default: false },
        ],
    },
    typst: {
        default_template_overrides: [],
    },
} as unknown as TemplateSpec;

const umbApaLikeSpec = {
    editor: {
        defaults: {
            paper_size: "us-letter",
            language: "es",
            text_font: "Libertinus Serif",
            math_font: "Libertinus Math",
            raw_font: "DejaVu Sans Mono",
            font_size: 12,
            table_stroke_width: 0.5,
        },
        variants: [],
    },
    typst: {
        default_template_overrides: [
            { key: "outline.include_tables", value: "false" },
            { key: "outline.include_figures", value: "false" },
        ],
    },
} as unknown as TemplateSpec;

describe("projectSettingsFromTemplate", () => {
    it("keeps fallback settings when spec is missing", () => {
        expect(projectSettingsFromTemplate(null)).toEqual(FALLBACK_PROJECT_SETTINGS);
    });

    it("applies editor.defaults from the template spec", () => {
        const settings = projectSettingsFromTemplate(apa7LikeSpec);
        expect(settings.font_size).toBe(12);
        expect(settings.language).toBe("en");
    });

    it("applies typst.default_template_overrides for new projects", () => {
        const settings = projectSettingsFromTemplate(umbApaLikeSpec);
        expect(settings.language).toBe("es");
        expect(settings.template_overrides).toEqual([
            { key: "outline.include_tables", value: "false" },
            { key: "outline.include_figures", value: "false" },
        ]);
    });

    it("uses plain-template outline disables for the none template", () => {
        const settings = projectSettingsFromTemplate(null, { noneTemplate: true });
        expect(settings.template_overrides).toHaveLength(6);
        expect(
            settings.template_overrides.every((entry) => entry.value === "false"),
        ).toBe(true);
    });
});

describe("applyDefaultsSpec", () => {
    it("only overrides fields present in the spec", () => {
        const settings = applyDefaultsSpec(FALLBACK_PROJECT_SETTINGS, {
            paper_size: null,
            language: "es",
            text_font: null,
            math_font: null,
            raw_font: null,
            font_size: 12,
            table_stroke_width: null,
        });
        expect(settings.language).toBe("es");
        expect(settings.font_size).toBe(12);
        expect(settings.text_font).toBe("Libertinus Serif");
    });
});

describe("defaultTemplateVariantId", () => {
    it("returns the variant marked default", () => {
        expect(defaultTemplateVariantId(apa7LikeSpec)).toBe("student");
    });

    it("returns null when the template has no variants", () => {
        expect(defaultTemplateVariantId(umbApaLikeSpec)).toBeNull();
    });
});
