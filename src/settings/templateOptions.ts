import type { ProjectSettings } from "../bindings/ProjectSettings";
import type { TemplateOptionSpec } from "../bindings/TemplateOptionSpec";

/** Minimum choice count before project-settings options use a searchable combobox. */
export const TEMPLATE_OPTION_COMBOBOX_THRESHOLD = 7;

export const templateOptionOverrideKey = (optionId: string): string =>
    `option.${optionId}`;

export const getTemplateOptionValue = (
    settings: ProjectSettings,
    spec: TemplateOptionSpec,
): string => {
    const key = templateOptionOverrideKey(spec.id);
    const stored = settings.template_overrides.find((entry) => entry.key === key);
    if (stored) {
        return stored.value;
    }
    if (spec.default !== undefined && spec.default !== null) {
        if (typeof spec.default === "boolean") {
            return spec.default ? "true" : "false";
        }
        return String(spec.default);
    }
    if (spec.kind === "boolean") {
        return "false";
    }
    return spec.choices[0]?.value ?? "";
};

export const isTemplateOptionEnabled = (
    settings: ProjectSettings,
    spec: TemplateOptionSpec,
): boolean => getTemplateOptionValue(settings, spec).trim().toLowerCase() === "true";

export const setTemplateOptionValue = (
    settings: ProjectSettings,
    optionId: string,
    value: string,
): ProjectSettings => {
    const key = templateOptionOverrideKey(optionId);
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

export const choiceLabelForValue = (
    spec: TemplateOptionSpec,
    value: string,
    translate: (label: string) => string,
): string => {
    const match = spec.choices.find((choice) => choice.value === value);
    return match ? translate(match.label) : value;
};

export const choiceValueForLabel = (
    spec: TemplateOptionSpec,
    label: string,
    translate: (label: string) => string,
): string | null => {
    const match = spec.choices.find(
        (choice) => translate(choice.label) === label || choice.label === label,
    );
    return match?.value ?? null;
};
