import { VERSATILE_APA_TEMPLATE } from "./versatile-apa";
import type { TemplateSpec } from "./types";

const templates = new Map<string, TemplateSpec>([
    [VERSATILE_APA_TEMPLATE.template.id, VERSATILE_APA_TEMPLATE],
]);

export const getTemplateSpec = (templateId: string): TemplateSpec =>
    templates.get(templateId) ?? VERSATILE_APA_TEMPLATE;

export const listTemplateSpecs = (): TemplateSpec[] =>
    Array.from(templates.values());
