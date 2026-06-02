import type { ProjectSettings } from "../bindings/ProjectSettings";
import { normalizeDocumentLanguage } from "./documentLanguage";
import {
    getTemplateOverride,
    OUTLINE_TITLE_OVERRIDE_KEYS,
    type OutlineTitleOverrideKey,
} from "./templateOverrides";

export { normalizeDocumentLanguage } from "./documentLanguage";

export type OutlineTitleKind = keyof typeof OUTLINE_TITLE_OVERRIDE_KEYS;

const EN_DEFAULTS: Record<OutlineTitleKind, string> = {
    contents: "Contents",
    tables: "Tables",
    figures: "Figures",
    equations: "Equations",
    listings: "Listings",
    appendices: "Appendices",
};

const ES_DEFAULTS: Record<OutlineTitleKind, string> = {
    contents: "Índice",
    tables: "Tablas",
    figures: "Figuras",
    equations: "Ecuaciones",
    listings: "Listados",
    appendices: "Apéndices",
};

export const defaultOutlineTitle = (
    language: string | null | undefined,
    kind: OutlineTitleKind,
): string => {
    const locale = normalizeDocumentLanguage(language);
    return locale === "es" ? ES_DEFAULTS[kind] : EN_DEFAULTS[kind];
};

export const effectiveOutlineTitle = (
    settings: ProjectSettings,
    kind: OutlineTitleKind,
): string => {
    const key: OutlineTitleOverrideKey = OUTLINE_TITLE_OVERRIDE_KEYS[kind];
    const custom = getTemplateOverride(settings, key).trim();
    if (custom) {
        return custom;
    }
    return defaultOutlineTitle(settings.language, kind);
};
