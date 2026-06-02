import type { ProjectSettings } from "../bindings/ProjectSettings";
import type { TemplateOverride } from "../bindings/TemplateOverride";

export const OUTLINE_TITLE_OVERRIDE_KEYS = {
    contents: "outline.contents_title",
    tables: "outline.tables_title",
    figures: "outline.figures_title",
    equations: "outline.equations_title",
    listings: "outline.listings_title",
    appendices: "outline.appendices_title",
} as const;

export const OUTLINE_INCLUDE_OVERRIDE_KEYS = {
    contents: "outline.include_contents",
    tables: "outline.include_tables",
    figures: "outline.include_figures",
    equations: "outline.include_equations",
    listings: "outline.include_listings",
    appendices: "outline.include_appendices",
} as const;

export type OutlineTitleOverrideKey =
    (typeof OUTLINE_TITLE_OVERRIDE_KEYS)[keyof typeof OUTLINE_TITLE_OVERRIDE_KEYS];

export type OutlineIncludeOverrideKey =
    (typeof OUTLINE_INCLUDE_OVERRIDE_KEYS)[keyof typeof OUTLINE_INCLUDE_OVERRIDE_KEYS];

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

const outlineIncludeFromOverrides = (
    overrides: TemplateOverride[],
    key: OutlineIncludeOverrideKey,
): boolean | null => {
    const entry = overrides.find((item) => item.key === key);
    if (!entry) {
        return null;
    }
    return entry.value.trim().toLowerCase() !== "false";
};

/** Defaults for new projects and when a project override is absent (from template spec). */
export const plainTemplateOutlineDisabledOverrides = (): TemplateOverride[] =>
    (Object.values(OUTLINE_INCLUDE_OVERRIDE_KEYS) as OutlineIncludeOverrideKey[]).map(
        (key) => ({ key, value: "false" }),
    );

export const getOutlineInclude = (
    settings: ProjectSettings,
    key: OutlineIncludeOverrideKey,
    templateDefaultOverrides: TemplateOverride[] = [],
): boolean => {
    const project = outlineIncludeFromOverrides(settings.template_overrides, key);
    if (project !== null) {
        return project;
    }
    const templateDefault = outlineIncludeFromOverrides(templateDefaultOverrides, key);
    if (templateDefault !== null) {
        return templateDefault;
    }
    return true;
};

export const setOutlineInclude = (
    settings: ProjectSettings,
    key: OutlineIncludeOverrideKey,
    included: boolean,
): ProjectSettings => setTemplateOverride(settings, key, included ? "true" : "false");
