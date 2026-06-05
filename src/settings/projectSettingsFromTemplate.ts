import type { DefaultsSpec } from "../bindings/DefaultsSpec";
import type { ProjectSettings } from "../bindings/ProjectSettings";
import type { TemplateSpec } from "../bindings/TemplateSpec";
import { plainTemplateOutlineDisabledOverrides } from "./templateOverrides";

/** Used when no template spec is available (tests, welcome placeholder). */
export const FALLBACK_PROJECT_SETTINGS: ProjectSettings = {
    paper_size: "us-letter",
    language: "en",
    text_font: "Libertinus Serif",
    math_font: "Libertinus Math",
    raw_font: "DejaVu Sans Mono",
    font_size: 11,
    table_stroke_width: 0.5,
    template_overrides: [],
};

export const applyDefaultsSpec = (
    settings: ProjectSettings,
    defaults: DefaultsSpec,
): ProjectSettings => ({
    ...settings,
    paper_size: defaults.paper_size ?? settings.paper_size,
    language: defaults.language ?? settings.language,
    text_font: defaults.text_font ?? settings.text_font,
    math_font: defaults.math_font ?? settings.math_font,
    raw_font: defaults.raw_font ?? settings.raw_font,
    font_size: defaults.font_size ?? settings.font_size,
    table_stroke_width:
        defaults.table_stroke_width ?? settings.table_stroke_width,
});

export const defaultTemplateVariantId = (
    spec: TemplateSpec | null | undefined,
): string | null => {
    const variants = spec?.editor.variants ?? [];
    const markedDefault = variants.find((variant) => variant.default);
    if (markedDefault) {
        return markedDefault.id;
    }
    return variants[0]?.id ?? null;
};

export const projectSettingsFromTemplate = (
    spec: TemplateSpec | null | undefined,
    options?: { noneTemplate?: boolean },
): ProjectSettings => {
    let settings: ProjectSettings = {
        ...FALLBACK_PROJECT_SETTINGS,
        template_overrides: [],
    };

    if (spec?.editor.defaults) {
        settings = applyDefaultsSpec(settings, spec.editor.defaults);
    }

    if (options?.noneTemplate) {
        settings.template_overrides = plainTemplateOutlineDisabledOverrides();
    } else if ((spec?.typst.default_template_overrides.length ?? 0) > 0) {
        settings.template_overrides = spec!.typst.default_template_overrides.map(
            (entry) => ({ ...entry }),
        );
    }

    return settings;
};
