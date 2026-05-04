import { APA7_TEMPLATE } from "./apa7";
import type { TemplateManifest } from "./types";

const templates = new Map<string, TemplateManifest>([
    [APA7_TEMPLATE.id, APA7_TEMPLATE],
]);

export const getTemplateManifest = (templateId: string): TemplateManifest =>
    templates.get(templateId) ?? APA7_TEMPLATE;

export const listTemplateManifests = (): TemplateManifest[] =>
    Array.from(templates.values());
