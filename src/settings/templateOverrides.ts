import type { ProjectSettings } from "../bindings/ProjectSettings";

export const OUTLINE_TITLE_OVERRIDE_KEYS = {
    contents: "outline.contents_title",
    tables: "outline.tables_title",
    figures: "outline.figures_title",
    equations: "outline.equations_title",
    listings: "outline.listings_title",
    appendices: "outline.appendices_title",
} as const;

export type OutlineTitleOverrideKey =
    (typeof OUTLINE_TITLE_OVERRIDE_KEYS)[keyof typeof OUTLINE_TITLE_OVERRIDE_KEYS];

export const getTemplateOverride = (
    settings: ProjectSettings,
    key: string,
): string =>
    settings.template_overrides.find((entry) => entry.key === key)?.value ?? "";

export const setTemplateOverride = (
    settings: ProjectSettings,
    key: string,
    value: string,
): ProjectSettings => {
    const trimmed = value.trim();
    const template_overrides = settings.template_overrides.filter(
        (entry) => entry.key !== key,
    );

    if (trimmed) {
        template_overrides.push({ key, value: trimmed });
    }

    return {
        ...settings,
        template_overrides,
    };
};
