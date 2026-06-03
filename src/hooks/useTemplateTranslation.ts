import { getLocale } from "../paraglide/runtime.js";
import type { TemplateSpec } from "../bindings/TemplateSpec";

export const useTemplateTranslation = (spec: TemplateSpec | null) => {
    const locale = getLocale();
    const lang = locale.split("-")[0] ?? "en";

    const t = (key: string | undefined): string => {
        if (!key) return "";
        if (!spec || !spec.messages) return key;

        // Try exact locale match first (e.g. "es-CO" or "es")
        if (spec.messages[locale] && spec.messages[locale][key]) {
            return spec.messages[locale][key];
        }

        // Try primary language match (e.g. "es")
        if (spec.messages[lang] && spec.messages[lang][key]) {
            return spec.messages[lang][key];
        }

        // Try English translation as a lookup backup when active language is not English
        if (lang !== "en" && spec.messages["en"] && spec.messages["en"][key]) {
            return spec.messages["en"][key];
        }

        // If no translation is found, return the key itself.
        // This is a primary, first-class feature that supports raw/default labels specified
        // directly in template.json without requiring translation dictionary entries.
        return key;
    };

    return t;
};
